import { StructuredDiagramInput } from '../projects/projects.service';
import { findAll, findChild, findChildren, parseXml, XmlElement } from './xml.util';

/**
 * RF13: interpreta un documento XMI 2.1 (perfil UML2 — el que produce
 * xmi-builder.util.ts y también Enterprise Architect al exportar) y lo
 * reduce al mismo subconjunto que soporta el resto de la plataforma:
 * clases con atributos/métodos y relaciones (asociación o herencia) por
 * NOMBRE de clase, listo para ProjectsService.importStructuredModel.
 *
 * No resuelve tipos de datos declarados en un paquete de tipos propio del
 * modelador (solo el patrón href "...#Tipo" que usa el exportador de esta
 * plataforma) ni conserva paquetes/estereotipos/información de diagrama:
 * ese es el límite explícito de interoperabilidad de CONTEXT.md.
 */
export function parseXmi(xmlText: string): StructuredDiagramInput {
  const root = parseXml(xmlText);
  const packagedElements = findAll(root, 'packagedElement');

  const classElements = packagedElements.filter(
    (el) => el.attrs['xmi:type'] === 'uml:Class' || el.attrs['xmi:type'] === 'uml:AssociationClass',
  );
  const associationElements = packagedElements.filter(
    (el) =>
      el.attrs['xmi:type'] === 'uml:Association' ||
      el.attrs['xmi:type'] === 'uml:AssociationClass',
  );
  const realizationElements = packagedElements.filter(
    (el) => el.attrs['xmi:type'] === 'uml:Realization',
  );
  const dependencyElements = packagedElements.filter(
    (el) => el.attrs['xmi:type'] === 'uml:Dependency',
  );

  const idToName = new Map<string, string>();
  for (const cls of classElements) {
    const id = cls.attrs['xmi:id'];
    const name = cls.attrs['name']?.trim();
    if (id && name) idToName.set(id, name);
  }

  // Enterprise Architect (y esta plataforma) declaran los tipos primitivos
  // como elementos aparte (uml:PrimitiveType) y los referencian por id
  // (xmi:idref) desde <type>, en vez de escribir el nombre directo.
  const primitiveElements = findAll(root, 'packagedElement').filter(
    (el) => el.attrs['xmi:type'] === 'uml:PrimitiveType',
  );
  for (const prim of primitiveElements) {
    const id = prim.attrs['xmi:id'];
    const name = prim.attrs['name']?.trim();
    if (id && name) idToName.set(id, name);
  }

  const classes: StructuredDiagramInput['classes'] = [];
  const inheritance: Array<{ sourceId: string; targetId: string }> = [];

  for (const cls of classElements) {
    const name = cls.attrs['name']?.trim();
    if (!name) continue;

    const attributes = findChildren(cls, 'ownedAttribute').map((attr) => ({
      name: attr.attrs['name']?.trim() || 'campo',
      type: extractTypeName(attr, idToName),
    }));

    const methods = findChildren(cls, 'ownedOperation').map((op) => {
      const params = findChildren(op, 'ownedParameter');
      const inParams = params.filter((p) => (p.attrs['direction'] ?? 'in') !== 'return');
      const returnParam = params.find((p) => p.attrs['direction'] === 'return');
      return {
        name: op.attrs['name']?.trim() || 'metodo',
        parameters: inParams
          .map((p) => `${p.attrs['name']?.trim() || 'param'}: ${extractTypeName(p, idToName)}`)
          .join(', '),
        returnType: returnParam ? extractTypeName(returnParam, idToName) : 'void',
      };
    });

    const isAssociative = cls.attrs['xmi:type'] === 'uml:AssociationClass';
    classes.push({ name, isAssociative, attributes, methods });

    const classId = cls.attrs['xmi:id'];
    if (classId) {
      for (const gen of findChildren(cls, 'generalization')) {
        const targetId = gen.attrs['general'];
        if (targetId) inheritance.push({ sourceId: classId, targetId });
      }
    }
  }

  const relationships: NonNullable<StructuredDiagramInput['relationships']> = [];

  for (const assoc of associationElements) {
    const ends = findChildren(assoc, 'ownedEnd');
    if (ends.length < 2) continue;
    let [endA, endB] = ends;

    // RF7: el extremo marcado con aggregation "shared"/"composite" es la
    // "parte"; si viene primero, se invierte para que source sea siempre
    // el "todo" (misma convencion que usa xmi-builder.util.ts al exportar).
    let relType: 'ASSOCIATION' | 'AGGREGATION' | 'COMPOSITION' = 'ASSOCIATION';
    const aggA = endA.attrs['aggregation'];
    const aggB = endB.attrs['aggregation'];
    if (aggA === 'composite' || aggB === 'composite') {
      relType = 'COMPOSITION';
      if (aggA === 'composite') [endA, endB] = [endB, endA];
    } else if (aggA === 'shared' || aggB === 'shared') {
      relType = 'AGGREGATION';
      if (aggA === 'shared') [endA, endB] = [endB, endA];
    }

    const sourceName = idToName.get(extractEndTypeId(endA) ?? '');
    const targetName = idToName.get(extractEndTypeId(endB) ?? '');
    if (!sourceName || !targetName) continue;

    relationships.push({
      sourceClassName: sourceName,
      targetClassName: targetName,
      name: assoc.attrs['name']?.trim() || undefined,
      sourceCardinality: boundsToCardinality(endA),
      targetCardinality: boundsToCardinality(endB),
      type: relType,
    });

    if (assoc.attrs['xmi:type'] === 'uml:AssociationClass') {
      const assocClassName = assoc.attrs['name']?.trim();
      if (assocClassName) {
        relationships.push({
          sourceClassName: sourceName,
          targetClassName: assocClassName,
          name: '«asociación»',
          type: 'ASSOCIATION',
        });
      }
    }
  }

  for (const dep of realizationElements) {
    const sourceName = idToName.get(dep.attrs['client'] ?? '');
    const targetName = idToName.get(dep.attrs['supplier'] ?? '');
    if (!sourceName || !targetName) continue;
    relationships.push({
      sourceClassName: sourceName,
      targetClassName: targetName,
      name: dep.attrs['name']?.trim() || undefined,
      type: 'REALIZATION',
    });
  }

  for (const dep of dependencyElements) {
    const sourceName = idToName.get(dep.attrs['client'] ?? '');
    const targetName = idToName.get(dep.attrs['supplier'] ?? '');
    if (!sourceName || !targetName) continue;
    relationships.push({
      sourceClassName: sourceName,
      targetClassName: targetName,
      name: dep.attrs['name']?.trim() || undefined,
      type: 'DEPENDENCY',
    });
  }

  for (const { sourceId, targetId } of inheritance) {
    const sourceName = idToName.get(sourceId);
    const targetName = idToName.get(targetId);
    if (!sourceName || !targetName) continue;
    relationships.push({
      sourceClassName: sourceName,
      targetClassName: targetName,
      type: 'INHERITANCE',
    });
  }

  return { classes, relationships };
}

/** Nombre "amigable" del tipo de un ownedAttribute/ownedParameter. */
function extractTypeName(el: XmlElement, idToName: Map<string, string>): string {
  const typeChild = findChild(el, 'type');
  if (typeChild) {
    const href = typeChild.attrs['href'];
    if (href?.includes('#')) return href.split('#').pop() || 'String';
    const idref = typeChild.attrs['xmi:idref'];
    if (idref) return idToName.get(idref) || idref;
  }
  return el.attrs['type'] || 'String';
}

/** Id de la clase referenciada por un ownedEnd (<type xmi:idref="..."/> hijo). */
function extractEndTypeId(end: XmlElement): string | undefined {
  const typeChild = findChild(end, 'type');
  return typeChild?.attrs['xmi:idref'] || end.attrs['type'];
}

/** Multiplicidad de un ownedEnd -> "1" | "0..1" | "0..*" | etc. */
function boundsToCardinality(end: XmlElement): string {
  const lower = findChild(end, 'lowerValue')?.attrs['value'] ?? '1';
  const upper = findChild(end, 'upperValue')?.attrs['value'] ?? '1';
  return lower === upper ? lower : `${lower}..${upper}`;
}
