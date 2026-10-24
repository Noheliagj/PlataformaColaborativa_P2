import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import {
  DiagramForGenerator,
  ProjectsService,
} from '../projects/projects.service';

/**
 * RF7/RF14 - Motor universal de generación de código Spring Boot.
 *
 * Traduce las tablas normalizadas del diagrama (classes/attributes +
 * relationships, ver ProjectsService.getDiagramForGenerator) a un proyecto
 * Maven de Spring Boot 3 / Java 21 mínimo pero ejecutable: pom.xml,
 * application.properties, clase principal y una entidad JPA por clase del
 * diagrama, con las anotaciones de relación (@OneToMany/@ManyToOne/
 * @OneToOne/@ManyToMany) derivadas de las cardinalidades de cada asociación.
 */

const BASE_PACKAGE = 'com.generado.app';
const BASE_PACKAGE_PATH = 'src/main/java/com/generado/app';

type DiagramClass = DiagramForGenerator['classes'][number];
type DiagramRelationship = DiagramForGenerator['relationships'][number];

interface JavaField {
  name: string;
  type: string;
  annotationLines: string[];
}

interface EntityBuilder {
  className: string;
  tableName: string;
  fields: JavaField[];
  usedFieldNames: Set<string>;
  extraImports: Set<string>;
}

const JAVA_TYPE_MAP: Record<string, string> = {
  string: 'String',
  str: 'String',
  text: 'String',
  varchar: 'String',
  char: 'String',
  int: 'Integer',
  integer: 'Integer',
  short: 'Integer',
  long: 'Long',
  number: 'Double',
  float: 'Double',
  double: 'Double',
  decimal: 'BigDecimal',
  boolean: 'Boolean',
  bool: 'Boolean',
  date: 'LocalDate',
  datetime: 'LocalDateTime',
  timestamp: 'LocalDateTime',
};

@Injectable()
export class GeneratorService {
  constructor(private readonly projects: ProjectsService) {}

  /** Carga el proyecto (dueño o colaborador) y genera el .zip del backend. */
  async generateSpringProject(
    userId: string,
    id: string,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const diagram = await this.projects.getDiagramForGenerator(userId, id);
    const buffer = await this.buildZipBuffer(diagram);
    return { fileName: `${slugify(diagram.projectName)}-spring.zip`, buffer };
  }

  /** Ensambla el .zip en memoria a partir del diagrama normalizado. */
  private async buildZipBuffer(diagram: DiagramForGenerator): Promise<Buffer> {
    const zip = new JSZip();

    zip.file('pom.xml', buildPomXml(diagram.projectName));
    zip.file(
      'src/main/resources/application.properties',
      buildApplicationProperties(diagram.projectName),
    );
    zip.file(`${BASE_PACKAGE_PATH}/Application.java`, buildApplicationJava());

    const entities = buildEntityBuilders(diagram);

    for (const file of renderEntityFiles(entities)) {
      zip.file(`${BASE_PACKAGE_PATH}/model/${file.name}`, file.content);
    }
    for (const file of buildRepositoryFiles(entities)) {
      zip.file(`${BASE_PACKAGE_PATH}/repository/${file.name}`, file.content);
    }
    for (const file of buildServiceFiles(entities)) {
      zip.file(`${BASE_PACKAGE_PATH}/service/${file.name}`, file.content);
    }
    for (const file of buildControllerFiles(entities)) {
      zip.file(`${BASE_PACKAGE_PATH}/controller/${file.name}`, file.content);
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }
}

// ---------------------------------------------------------------------------
// Estructura base del proyecto Maven
// ---------------------------------------------------------------------------

function buildPomXml(projectName: string): string {
  const safeName = escapeXml(projectName || 'Proyecto');
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>

  <groupId>com.generado</groupId>
  <artifactId>app</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${safeName}</name>
  <description>Backend generado automaticamente a partir del diagrama de clases</description>

  <properties>
    <java.version>21</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>com.h2database</groupId>
      <artifactId>h2</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function buildApplicationProperties(projectName: string): string {
  return `spring.application.name=${slugify(projectName)}

# Base de datos H2 en memoria: el backend generado arranca sin
# configuracion adicional. Cambia estas propiedades para apuntar a
# una base de datos real (PostgreSQL, MySQL, etc.) en produccion.
spring.datasource.url=jdbc:h2:mem:appdb;DB_CLOSE_DELAY=-1
spring.datasource.driverClassName=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.h2.console.enabled=true
`;
}

function buildApplicationJava(): string {
  return `package ${BASE_PACKAGE};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;
}

// ---------------------------------------------------------------------------
// Entidades JPA (classes) + relaciones (relationships/cardinalidades)
// ---------------------------------------------------------------------------

/** Resuelve nombres, campos y relaciones -> un EntityBuilder por clase del diagrama. */
function buildEntityBuilders(diagram: DiagramForGenerator): EntityBuilder[] {
  const builders = new Map<string, EntityBuilder>();
  const usedClassNames = new Set<string>();

  diagram.classes.forEach((classRow, index) => {
    const className = uniqueName(
      toPascalCase(classRow.name, `Entidad${index + 1}`),
      usedClassNames,
    );
    const builder: EntityBuilder = {
      className,
      tableName: pluralize(toSnakeCase(className)),
      fields: [],
      usedFieldNames: new Set(['id']),
      extraImports: new Set(),
    };
    addAttributeFields(builder, classRow.attributes);
    builders.set(classRow.id, builder);
  });

  for (const relationship of diagram.relationships) {
    const source = builders.get(relationship.sourceClassId);
    const target = builders.get(relationship.targetClassId);
    if (!source || !target) continue; // relación huerfana (clase eliminada)

    // Si es un vínculo visual auxiliar de clase asociativa UML (sin cardinalidades), se omite en JPA
    if (
      !relationship.sourceCardinality &&
      !relationship.targetCardinality &&
      (relationship.name === '«asociación»' ||
        relationship.name?.toLowerCase().includes('asociaci'))
    ) {
      continue;
    }

    applyRelation(source, target, relationship);
  }

  return [...builders.values()];
}

function renderEntityFiles(
  entities: EntityBuilder[],
): { name: string; content: string }[] {
  return entities.map((builder) => ({
    name: `${builder.className}.java`,
    content: renderEntity(builder),
  }));
}

/** Atributos ya estructurados (RF6, tabla `attributes`) -> campos con @Column. */
function addAttributeFields(
  builder: EntityBuilder,
  attributes: DiagramClass['attributes'],
) {
  attributes.forEach((attribute, index) => {
    const name = uniqueName(
      toCamelCase(attribute.name, `campo${index + 1}`),
      builder.usedFieldNames,
    );
    const type = mapJavaType(attribute.type);
    registerImportForType(builder, type);
    builder.fields.push({
      name,
      type,
      annotationLines: [`@Column(name = "${toSnakeCase(name)}")`],
    });
  });
}

/** Traduce una asociacion (con cardinalidad) en las anotaciones JPA de ambos lados. */
function applyRelation(
  source: EntityBuilder,
  target: EntityBuilder,
  relationship: DiagramRelationship,
) {
  const relationName = relationship.name?.trim();
  const sourceMany = isManyCardinality(relationship.sourceCardinality);
  const targetMany = isManyCardinality(relationship.targetCardinality);

  if (sourceMany && targetMany) {
    applyManyToMany(source, target, relationName);
  } else if (!sourceMany && targetMany) {
    // Un `source` tiene muchos `target` (p.ej. Cliente 1 -- 0..* Pedido).
    applyOneToMany(source, target, relationName);
  } else if (sourceMany && !targetMany) {
    // Muchos `source` para un `target` (FK en source).
    applyManyToOne(source, target, relationName);
  } else {
    applyOneToOne(source, target, relationName);
  }
}

function applyOneToMany(
  one: EntityBuilder,
  many: EntityBuilder,
  relationName?: string,
) {
  const ownerField = uniqueName(
    relationName ? toCamelCase(relationName) : toCamelCase(one.className),
    many.usedFieldNames,
  );
  const collectionField = uniqueName(
    pluralize(toCamelCase(many.className)),
    one.usedFieldNames,
  );

  many.extraImports.add('jakarta.persistence.*');
  many.fields.push({
    name: ownerField,
    type: one.className,
    annotationLines: [
      '@ManyToOne',
      `@JoinColumn(name = "${toSnakeCase(ownerField)}_id")`,
    ],
  });

  one.extraImports.add('java.util.List');
  one.fields.push({
    name: collectionField,
    type: `List<${many.className}>`,
    annotationLines: [`@OneToMany(mappedBy = "${ownerField}")`],
  });
}

function applyManyToOne(
  many: EntityBuilder,
  one: EntityBuilder,
  relationName?: string,
) {
  // Mismo caso que applyOneToMany con los lados invertidos.
  applyOneToMany(one, many, relationName);
}

function applyOneToOne(
  owner: EntityBuilder,
  inverse: EntityBuilder,
  relationName?: string,
) {
  const ownerField = uniqueName(
    relationName ? toCamelCase(relationName) : toCamelCase(inverse.className),
    owner.usedFieldNames,
  );
  const inverseField = uniqueName(
    toCamelCase(owner.className),
    inverse.usedFieldNames,
  );

  owner.fields.push({
    name: ownerField,
    type: inverse.className,
    annotationLines: [
      '@OneToOne',
      `@JoinColumn(name = "${toSnakeCase(ownerField)}_id")`,
    ],
  });

  inverse.fields.push({
    name: inverseField,
    type: owner.className,
    annotationLines: [`@OneToOne(mappedBy = "${ownerField}")`],
  });
}

function applyManyToMany(
  owner: EntityBuilder,
  inverse: EntityBuilder,
  relationName?: string,
) {
  const ownerField = uniqueName(
    relationName
      ? pluralize(toCamelCase(relationName))
      : pluralize(toCamelCase(inverse.className)),
    owner.usedFieldNames,
  );
  const inverseField = uniqueName(
    pluralize(toCamelCase(owner.className)),
    inverse.usedFieldNames,
  );

  owner.extraImports.add('java.util.List');
  owner.fields.push({
    name: ownerField,
    type: `List<${inverse.className}>`,
    annotationLines: [
      '@ManyToMany',
      '@JoinTable(',
      `    name = "${owner.tableName}_${inverse.tableName}",`,
      `    joinColumns = @JoinColumn(name = "${toSnakeCase(owner.className)}_id"),`,
      `    inverseJoinColumns = @JoinColumn(name = "${toSnakeCase(inverse.className)}_id")`,
      ')',
    ],
  });

  inverse.extraImports.add('java.util.List');
  inverse.fields.push({
    name: inverseField,
    type: `List<${owner.className}>`,
    annotationLines: [`@ManyToMany(mappedBy = "${ownerField}")`],
  });
}

function isManyCardinality(cardinality?: string | null): boolean {
  return cardinality === 'N' || cardinality === '0..*';
}

// ---------------------------------------------------------------------------
// Repository (Spring Data JPA)
// ---------------------------------------------------------------------------

function buildRepositoryFiles(
  entities: EntityBuilder[],
): { name: string; content: string }[] {
  return entities.map((builder) => ({
    name: `${builder.className}Repository.java`,
    content: `package ${BASE_PACKAGE}.repository;

import ${BASE_PACKAGE}.model.${builder.className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${builder.className}Repository extends JpaRepository<${builder.className}, Long> {
}
`,
  }));
}

// ---------------------------------------------------------------------------
// Service (logica de negocio minima: CRUD delegado al Repository)
// ---------------------------------------------------------------------------

function buildServiceFiles(
  entities: EntityBuilder[],
): { name: string; content: string }[] {
  return entities.map((builder) => {
    const varName = toCamelCase(builder.className);
    return {
      name: `${builder.className}Service.java`,
      content: `package ${BASE_PACKAGE}.service;

import ${BASE_PACKAGE}.model.${builder.className};
import ${BASE_PACKAGE}.repository.${builder.className}Repository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ${builder.className}Service {

    private final ${builder.className}Repository repository;

    public ${builder.className}Service(${builder.className}Repository repository) {
        this.repository = repository;
    }

    public List<${builder.className}> findAll() {
        return repository.findAll();
    }

    public Optional<${builder.className}> findById(Long id) {
        return repository.findById(id);
    }

    public ${builder.className} save(${builder.className} ${varName}) {
        return repository.save(${varName});
    }

    public ${builder.className} update(Long id, ${builder.className} ${varName}) {
        ${varName}.setId(id);
        return repository.save(${varName});
    }

    public void deleteById(Long id) {
        repository.deleteById(id);
    }

    public boolean existsById(Long id) {
        return repository.existsById(id);
    }
}
`,
    };
  });
}

// ---------------------------------------------------------------------------
// Controller (REST CRUD: GET all, GET por id, POST, PUT, DELETE)
// ---------------------------------------------------------------------------

function buildControllerFiles(
  entities: EntityBuilder[],
): { name: string; content: string }[] {
  return entities.map((builder) => {
    const varName = toCamelCase(builder.className);
    const basePath = `/api/${builder.tableName.replace(/_/g, '-')}`;
    return {
      name: `${builder.className}Controller.java`,
      content: `package ${BASE_PACKAGE}.controller;

import ${BASE_PACKAGE}.model.${builder.className};
import ${BASE_PACKAGE}.service.${builder.className}Service;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${basePath}")
public class ${builder.className}Controller {

    private final ${builder.className}Service service;

    public ${builder.className}Controller(${builder.className}Service service) {
        this.service = service;
    }

    @GetMapping
    public List<${builder.className}> getAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<${builder.className}> getById(@PathVariable Long id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${builder.className} create(@RequestBody ${builder.className} ${varName}) {
        return service.save(${varName});
    }

    @PutMapping("/{id}")
    public ResponseEntity<${builder.className}> update(
            @PathVariable Long id,
            @RequestBody ${builder.className} ${varName}) {
        if (!service.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(service.update(id, ${varName}));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!service.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
`,
    };
  });
}

// ---------------------------------------------------------------------------
// Render del archivo .java de una entidad
// ---------------------------------------------------------------------------

function renderEntity(builder: EntityBuilder): string {
  const imports = [
    'import jakarta.persistence.*;',
    ...[...builder.extraImports]
      .filter((imp) => imp !== 'jakarta.persistence.*')
      .sort()
      .map((imp) => `import ${imp};`),
  ];

  const fieldsBlock = builder.fields
    .map((field) => renderField(field))
    .join('\n\n');

  const accessorsBlock = [
    renderAccessors('id', 'Long'),
    ...builder.fields.map((field) => renderAccessors(field.name, field.type)),
  ].join('\n\n');

  return `package ${BASE_PACKAGE}.model;

${imports.join('\n')}

@Entity
@Table(name = "${builder.tableName}")
public class ${builder.className} {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

${fieldsBlock ? `${fieldsBlock}\n` : ''}
${accessorsBlock}
}
`;
}

function renderField(field: JavaField): string {
  const annotations = field.annotationLines
    .map((line) => `    ${line}`)
    .join('\n');
  return `${annotations}\n    private ${field.type} ${field.name};`;
}

function renderAccessors(name: string, type: string): string {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return `    public ${type} get${capitalized}() {
        return ${name};
    }

    public void set${capitalized}(${type} ${name}) {
        this.${name} = ${name};
    }`;
}

// ---------------------------------------------------------------------------
// Helpers de nombres / tipos
// ---------------------------------------------------------------------------

function mapJavaType(rawType?: string): string {
  const key = (rawType ?? '').trim().toLowerCase();
  return JAVA_TYPE_MAP[key] ?? 'String';
}

function registerImportForType(builder: EntityBuilder, type: string) {
  const importsByType: Record<string, string> = {
    BigDecimal: 'java.math.BigDecimal',
    LocalDate: 'java.time.LocalDate',
    LocalDateTime: 'java.time.LocalDateTime',
  };
  const imp = importsByType[type];
  if (imp) builder.extraImports.add(imp);
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPascalCase(raw: string | undefined, fallback = ''): string {
  const cleaned = stripDiacritics(raw ?? '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  const pascal = cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  return /^[0-9]/.test(pascal) ? `C${pascal}` : pascal;
}

function toCamelCase(raw: string | undefined, fallback = ''): string {
  const pascal = toPascalCase(raw, fallback);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(pascalOrCamel: string): string {
  return pascalOrCamel
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function pluralize(word: string): string {
  if (/[sxz]$|[cs]h$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function uniqueName(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let suffix = 2;
  while (used.has(`${candidate}${suffix}`)) suffix += 1;
  const name = `${candidate}${suffix}`;
  used.add(name);
  return name;
}

function slugify(name: string): string {
  const slug = stripDiacritics(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'proyecto';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
