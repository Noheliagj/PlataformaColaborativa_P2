import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EdgeStyle,
  Prisma,
  Project,
  RelationshipType,
  Visibility,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectModelDto } from './dto/update-project-model.dto';
import { JoinProjectDto } from './dto/join-project.dto';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { CreateAssociativeClassDto } from './dto/create-associative-class.dto';
import {
  formatAttributeLine,
  formatMethodLine,
  parseAttributeLine,
  parseMethodLine,
} from '../common/uml-member.util';

export type ProjectRole = 'OWNER' | 'COLLABORATOR';

/**
 * Forma que consume el editor (React Flow). Es la misma forma que antes se
 * guardaba tal cual en `Project.modelData`; ahora se reconstruye desde las
 * tablas relacionales (Diagram/ClassNode/Attribute/Method/Relationship) en
 * cada lectura, para que el contrato REST no cambie.
 */
export interface DiagramModel {
  nodes: Array<{
    id: string;
    type: 'classNode';
    position: { x: number; y: number };
    data: {
      name: string;
      attributes: string[];
      methods: string[];
      isAssociative: boolean;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type: 'customEdge';
    data: {
      relationName: string;
      sourceCardinality: string;
      targetCardinality: string;
      relationType: RelationshipType;
      sourceRole: string;
      targetRole: string;
      edgeStyle: EdgeStyle;
      isAuxiliary?: boolean;
    };
  }>;
}

/** Proyecto tal como se expone al frontend, con el rol del usuario que pide. */
export type ProjectWithRole = Project & {
  role: ProjectRole;
  modelData: DiagramModel;
};

/** RF9: una entrada del historial de guardados (GET /projects/:id/history). */
export interface ProjectActivityEntry {
  id: string;
  action: string;
  createdAt: Date;
  user: { id: string; name: string };
}

/** Chat en tiempo real del proyecto: un mensaje (GET /projects/:id/messages y evento `chat-message`). */
export interface ChatMessageEntry {
  id: string;
  content: string;
  createdAt: Date;
  projectId: string;
  user: { id: string; name: string };
}

/** Filas normalizadas para el generador Spring Boot (RF7/RF14): sin pasar
 * por el formateo a string que usa el editor (ver getDiagramForGenerator). */
export interface DiagramForGenerator {
  projectName: string;
  classes: Array<{
    id: string;
    name: string;
    attributes: Array<{ name: string; type: string }>;
  }>;
  relationships: Array<{
    sourceClassId: string;
    targetClassId: string;
    name: string | null;
    sourceCardinality: string | null;
    targetCardinality: string | null;
  }>;
}

/** Filas normalizadas para XMI (RF12/RF13): igual que DiagramForGenerator
 * pero con métodos, visibilidad y el tipo de relación (asociación/herencia),
 * que el generador Spring Boot no necesita pero el intercambio UML sí. */
export interface DiagramForXmi {
  projectName: string;
  classes: Array<{
    id: string;
    name: string;
    isAssociative?: boolean;
    attributes: Array<{ name: string; type: string; visibility: Visibility }>;
    methods: Array<{
      name: string;
      returnType: string;
      parameters: string;
      visibility: Visibility;
    }>;
  }>;
  relationships: Array<{
    id: string;
    type: RelationshipType;
    sourceClassId: string;
    targetClassId: string;
    name: string | null;
    sourceCardinality: string | null;
    targetCardinality: string | null;
  }>;
}

/**
 * Entrada de un diagrama completo "en bruto" (sin ids ni posiciones), usada
 * para reemplazar el diagrama de un proyecto desde una fuente externa:
 * RF11 (extracción por Vision de una imagen) y RF13 (importación XMI). Ver
 * ProjectsService.importStructuredModel.
 */
export interface StructuredDiagramInput {
  classes: Array<{
    name: string;
    isAssociative?: boolean;
    attributes?: Array<{ name: string; type?: string }>;
    methods?: Array<{
      name: string;
      returnType?: string;
      parameters?: string;
    }>;
  }>;
  relationships?: Array<{
    sourceClassName: string;
    targetClassName: string;
    name?: string;
    sourceCardinality?: string;
    targetCardinality?: string;
    type?:
      | 'ASSOCIATION'
      | 'AGGREGATION'
      | 'COMPOSITION'
      | 'INHERITANCE'
      | 'REALIZATION'
      | 'DEPENDENCY';
  }>;
}

const VALID_RELATIONSHIP_TYPES = new Set<string>([
  RelationshipType.ASSOCIATION,
  RelationshipType.AGGREGATION,
  RelationshipType.COMPOSITION,
  RelationshipType.INHERITANCE,
  RelationshipType.REALIZATION,
  RelationshipType.DEPENDENCY,
]);

export function normalizeRelationshipType(type?: string): RelationshipType {
  if (!type) return RelationshipType.ASSOCIATION;
  const upper = type.trim().toUpperCase();
  if (
    upper === 'MANY_TO_MANY' ||
    upper === 'MANY-TO-MANY' ||
    upper === 'N:M' ||
    upper === 'N_M'
  ) {
    return RelationshipType.ASSOCIATION;
  }
  if (VALID_RELATIONSHIP_TYPES.has(upper as RelationshipType)) {
    return upper as RelationshipType;
  }
  return RelationshipType.ASSOCIATION;
}

export function normalizeEdgeStyle(style?: string): EdgeStyle {
  if (!style) return EdgeStyle.ORTHOGONAL_SOFT;
  const upper = style.trim().toUpperCase();
  const validStyles = new Set<string>([
    EdgeStyle.ORTHOGONAL_SOFT,
    EdgeStyle.ORTHOGONAL_90,
    EdgeStyle.STRAIGHT,
    EdgeStyle.BEZIER,
  ]);
  return validStyles.has(upper) ? (upper as EdgeStyle) : EdgeStyle.ORTHOGONAL_SOFT;
}

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

function generateInviteCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS.charAt(
      Math.floor(Math.random() * INVITE_CODE_CHARS.length),
    );
  }
  return code;
}

/** RF4: contraseña numérica de 6 dígitos para acompañar el código de invitación. */
function generateInvitePassword(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const DIAGRAM_INCLUDE = {
  classes: {
    include: {
      attributes: { orderBy: { orderIndex: 'asc' as const } },
      methods: { orderBy: { orderIndex: 'asc' as const } },
    },
  },
  relationships: true,
} satisfies Prisma.DiagramInclude;

/**
 * RF3 / RF5 / RF6 / RF4 / RF10: gestión de proyectos, del diagrama asociado
 * (guardado de forma relacional, ver DiagramModel arriba) y de la
 * colaboración (invitación por código + contraseña).
 *
 * El acceso de LECTURA/ESCRITURA sobre el diagrama lo tiene el dueño y
 * cualquier colaborador que se haya unido (ProjectMember). Operaciones
 * sensibles (eliminar, ver credenciales de invitación) siguen siendo
 * exclusivas del dueño.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    // Reintenta si el código de invitación colisiona (muy improbable, 8
    // caracteres de un alfabeto de 33 símbolos).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.project.create({
          data: {
            name: dto.name,
            description: dto.description,
            ownerId,
            inviteCode: generateInviteCode(),
            invitePassword: generateInvitePassword(),
            // RF5: cada proyecto nace con su diagrama (vacío) — es un 1:1,
            // no hace falta crearlo "on demand" al primer guardado.
            diagram: { create: {} },
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < 4
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException(
      'No se pudo generar un código de invitación único',
    );
  }

  /** RF3: proyectos propios + RF10: proyectos ajenos donde el usuario colabora. */
  async findAllForUser(
    userId: string,
  ): Promise<Array<Project & { role: ProjectRole }>> {
    const [owned, memberships] = await Promise.all([
      this.prisma.project.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectMember.findMany({
        where: { userId },
        include: { project: true },
        orderBy: { project: { updatedAt: 'desc' } },
      }),
    ]);

    const ownedWithRole = owned.map((p) =>
      this.redactInvite({ ...p, role: 'OWNER' as const }),
    );
    const memberWithRole = memberships.map((m) =>
      this.redactInvite({ ...m.project, role: 'COLLABORATOR' as const }),
    );

    return [...ownedWithRole, ...memberWithRole].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  /** Proyecto individual (incluye el diagrama) para dueño o colaborador. */
  async findOneAccessible(
    userId: string,
    id: string,
  ): Promise<ProjectWithRole> {
    const { role } = await this.getAccessibleOrThrow(userId, id);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id },
    });
    return this.redactInvite({
      ...project,
      role,
      modelData: await this.getModelData(id),
    });
  }

  /**
   * RF5/RF6/RF9: guarda el diagrama completo (dueño o colaborador pueden
   * editar). Reemplazo transaccional total con validación robusta y manejo
   * de errores para evitar errores 500 no controlados.
   */
  async updateModel(
    userId: string,
    id: string,
    dto: UpdateProjectModelDto,
  ): Promise<ProjectWithRole> {
    if (!dto || !Array.isArray(dto.nodes) || !Array.isArray(dto.edges)) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'El cuerpo de la solicitud debe incluir arrays válidos de nodos y aristas',
        error: 'Bad Request',
      });
    }

    const { project } = await this.getAccessibleOrThrow(userId, id);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Todo proyecto tiene su diagrama desde que se creó (ver create()).
        const diagram = await tx.diagram.findUnique({
          where: { projectId: id },
        });
        if (!diagram) {
          throw new NotFoundException({
            statusCode: 404,
            message: `No se encontró el diagrama para el proyecto ${id}`,
            error: 'Not Found',
          });
        }

        // Las relaciones se borran antes que las clases por las FKs; borrar
        // las clases además arrastra en cascada sus atributos/métodos.
        await tx.relationship.deleteMany({ where: { diagramId: diagram.id } });
        await tx.classNode.deleteMany({ where: { diagramId: diagram.id } });

        // Validamos y deduplicamos los IDs de los nodos para evitar colisiones
        const seenNodeIds = new Set<string>();

        for (const [index, node] of dto.nodes.entries()) {
          const rawId = typeof node.id === 'string' ? node.id.trim() : '';
          const nodeId = rawId || randomUUID();
          if (seenNodeIds.has(nodeId)) {
            continue; // Evita conflicto de clave primaria duplicada
          }
          seenNodeIds.add(nodeId);

          const className =
            typeof node.data?.name === 'string' && node.data.name.trim()
              ? node.data.name.trim()
              : `Clase_${index + 1}`;

          const posX =
            typeof node.position?.x === 'number' && !isNaN(node.position.x)
              ? node.position.x
              : 0;
          const posY =
            typeof node.position?.y === 'number' && !isNaN(node.position.y)
              ? node.position.y
              : 0;

          await tx.classNode.create({
            data: {
              id: nodeId,
              diagramId: diagram.id,
              name: className,
              positionX: posX,
              positionY: posY,
              isAssociative: Boolean(node.data?.isAssociative),
              attributes: {
                create: (node.data?.attributes ?? [])
                  .filter((raw) => typeof raw === 'string' && raw.trim())
                  .map((raw, attrIndex) => ({
                    ...parseAttributeLine(raw),
                    orderIndex: attrIndex,
                  })),
              },
              methods: {
                create: (node.data?.methods ?? [])
                  .filter((raw) => typeof raw === 'string' && raw.trim())
                  .map((raw, methIndex) => ({
                    ...parseMethodLine(raw),
                    orderIndex: methIndex,
                  })),
              },
            },
          });
        }

        // Validación previa de aristas y sus IDs de origen y destino
        const seenEdgeIds = new Set<string>();
        const validEdgesData: Array<{
          id: string;
          diagramId: string;
          sourceClassId: string;
          targetClassId: string;
          name: string | null;
          sourceCardinality: string | null;
          targetCardinality: string | null;
          type: RelationshipType;
          sourceRole: string | null;
          targetRole: string | null;
          edgeStyle: EdgeStyle;
        }> = [];

        for (const edge of dto.edges) {
          if (
            !edge ||
            typeof edge.source !== 'string' ||
            typeof edge.target !== 'string'
          ) {
            continue;
          }
          const sourceId = edge.source.trim();
          const targetId = edge.target.trim();

          // Validación previa de los IDs de origen y destino
          if (!seenNodeIds.has(sourceId) || !seenNodeIds.has(targetId)) {
            continue; // Se descartan aristas huérfanas o con IDs inexistentes
          }

          const rawEdgeId = typeof edge.id === 'string' ? edge.id.trim() : '';
          const edgeId =
            rawEdgeId && !seenEdgeIds.has(rawEdgeId) ? rawEdgeId : randomUUID();
          seenEdgeIds.add(edgeId);

          const relType = normalizeRelationshipType(edge.data?.relationType);
          const style = normalizeEdgeStyle(edge.data?.edgeStyle);

          validEdgesData.push({
            id: edgeId,
            diagramId: diagram.id,
            sourceClassId: sourceId,
            targetClassId: targetId,
            name:
              typeof edge.data?.relationName === 'string'
                ? edge.data.relationName.trim() || null
                : null,
            sourceCardinality:
              typeof edge.data?.sourceCardinality === 'string'
                ? edge.data.sourceCardinality.trim() || null
                : null,
            targetCardinality:
              typeof edge.data?.targetCardinality === 'string'
                ? edge.data.targetCardinality.trim() || null
                : null,
            type: relType,
            sourceRole:
              typeof edge.data?.sourceRole === 'string'
                ? edge.data.sourceRole.trim() || null
                : null,
            targetRole:
              typeof edge.data?.targetRole === 'string'
                ? edge.data.targetRole.trim() || null
                : null,
            edgeStyle: style,
          });
        }

        if (validEdgesData.length > 0) {
          await tx.relationship.createMany({
            data: validEdgesData,
          });
        }

        // RF9: refleja el guardado en Project.updatedAt (lo usa el dashboard).
        await tx.project.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        // RF9: historial — queda registro de quién guardó y cuándo.
        await tx.projectActivity.create({
          data: { projectId: id, userId, action: 'SAVE_DIAGRAM' },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        `Error guardando modelo de proyecto ${id}: ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new BadRequestException({
            statusCode: 400,
            message:
              'Conflicto de clave única duplicada en clases o relaciones del diagrama',
            error: 'Bad Request',
          });
        }
        if (err.code === 'P2003') {
          throw new BadRequestException({
            statusCode: 400,
            message:
              'Restricción de clave foránea violada: el ID de origen o destino no existe',
            error: 'Bad Request',
          });
        }
      }

      throw new BadRequestException({
        statusCode: 400,
        message:
          err instanceof Error
            ? err.message
            : 'Error interno al procesar el diagrama',
        error: 'Bad Request',
      });
    }

    // Notifica al dueño solo cuando el cambio lo hizo un colaborador — que
    // el propio dueño se autonotifique al guardar no aporta nada.
    if (userId !== project.ownerId) {
      const collaborator = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await this.notifications.notifyOwner({
        ownerId: project.ownerId,
        projectId: id,
        type: 'DIAGRAM_SAVED',
        message: `${collaborator?.name ?? 'Un colaborador'} guardó cambios en "${project.name}"`,
      });
    }

    return this.findOneAccessible(userId, id);
  }

  /**
   * Creación puntual de relaciones con validación estricta de IDs de origen
   * y destino, normalización de cardinalidades/tipos y manejo robusto de excepciones.
   */
  async createRelationship(
    userId: string,
    projectId: string,
    dto: CreateRelationshipDto,
  ) {
    if (!dto || !dto.sourceClassId || !dto.targetClassId) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Los IDs de origen (sourceClassId) y destino (targetClassId) son requeridos',
        error: 'Bad Request',
      });
    }

    await this.getAccessibleOrThrow(userId, projectId);
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId },
    });
    if (!diagram) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Diagrama no encontrado para el proyecto ${projectId}`,
        error: 'Not Found',
      });
    }

    const [sourceClass, targetClass] = await Promise.all([
      this.prisma.classNode.findFirst({
        where: { id: dto.sourceClassId, diagramId: diagram.id },
      }),
      this.prisma.classNode.findFirst({
        where: { id: dto.targetClassId, diagramId: diagram.id },
      }),
    ]);

    if (!sourceClass || !targetClass) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Una o ambas clases especificadas no existen en el proyecto (origen: ${dto.sourceClassId}, destino: ${dto.targetClassId})`,
        error: 'Bad Request',
      });
    }

    try {
      const relType = normalizeRelationshipType(dto.relationType);
      const edgeStyle = normalizeEdgeStyle(dto.edgeStyle);

      const relationship = await this.prisma.relationship.create({
        data: {
          id: randomUUID(),
          diagramId: diagram.id,
          sourceClassId: sourceClass.id,
          targetClassId: targetClass.id,
          name: dto.name?.trim() || null,
          sourceCardinality: dto.sourceCardinality?.trim() || null,
          targetCardinality: dto.targetCardinality?.trim() || null,
          type: relType,
          sourceRole: dto.sourceRole?.trim() || null,
          targetRole: dto.targetRole?.trim() || null,
          edgeStyle,
        },
      });

      return {
        statusCode: 201,
        message: 'Relación creada exitosamente',
        relationship,
        modelData: await this.getModelData(projectId),
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            'Ya existe una relación con esos identificadores o restricción única violada',
          error: 'Bad Request',
        });
      }
      throw new BadRequestException({
        statusCode: 400,
        message:
          err instanceof Error
            ? err.message
            : 'Error inesperado al crear la relación',
        error: 'Bad Request',
      });
    }
  }

  /**
   * Generación de clase de asociación (tabla intermedia para relaciones muchos a muchos)
   * con validación de IDs de origen y destino y creación coordinada en transacción.
   */
  async createAssociativeClass(
    userId: string,
    projectId: string,
    dto: CreateAssociativeClassDto,
  ) {
    if (!dto || !dto.sourceClassId || !dto.targetClassId) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Los IDs de origen (sourceClassId) y destino (targetClassId) son requeridos para crear la clase asociativa',
        error: 'Bad Request',
      });
    }

    await this.getAccessibleOrThrow(userId, projectId);
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId },
    });
    if (!diagram) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Diagrama no encontrado para el proyecto ${projectId}`,
        error: 'Not Found',
      });
    }

    const [sourceClass, targetClass] = await Promise.all([
      this.prisma.classNode.findFirst({
        where: { id: dto.sourceClassId, diagramId: diagram.id },
      }),
      this.prisma.classNode.findFirst({
        where: { id: dto.targetClassId, diagramId: diagram.id },
      }),
    ]);

    if (!sourceClass || !targetClass) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Una o ambas clases especificadas no existen en el diagrama (origen: ${dto.sourceClassId}, destino: ${dto.targetClassId})`,
        error: 'Bad Request',
      });
    }

    try {
      const associativeName =
        dto.name?.trim() || `${sourceClass.name}${targetClass.name}`;
      const midX = (sourceClass.positionX + targetClass.positionX) / 2;
      const midY =
        Math.max(sourceClass.positionY, targetClass.positionY) + 160;

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Crear la clase de asociación
        const assocClass = await tx.classNode.create({
          data: {
            id: randomUUID(),
            diagramId: diagram.id,
            name: associativeName,
            positionX: midX,
            positionY: midY,
            isAssociative: true,
            attributes: {
              create: (dto.attributes ?? []).map((attr, idx) => ({
                ...parseAttributeLine(attr),
                orderIndex: idx,
              })),
            },
            methods: {
              create: (dto.methods ?? []).map((meth, idx) => ({
                ...parseMethodLine(meth),
                orderIndex: idx,
              })),
            },
          },
        });

        // 2. Asegurar que las clases principales mantienen su relación directa
        const existingMainRel = await tx.relationship.findFirst({
          where: {
            diagramId: diagram.id,
            OR: [
              {
                sourceClassId: sourceClass.id,
                targetClassId: targetClass.id,
              },
              {
                sourceClassId: targetClass.id,
                targetClassId: sourceClass.id,
              },
            ],
          },
        });

        if (!existingMainRel) {
          await tx.relationship.create({
            data: {
              id: randomUUID(),
              diagramId: diagram.id,
              sourceClassId: sourceClass.id,
              targetClassId: targetClass.id,
              sourceCardinality: '0..*',
              targetCardinality: '0..*',
              type: RelationshipType.ASSOCIATION,
              edgeStyle: EdgeStyle.ORTHOGONAL_SOFT,
            },
          });
        }

        // 3. Crear el vínculo auxiliar hacia la clase de asociación
        const auxRel = await tx.relationship.create({
          data: {
            id: randomUUID(),
            diagramId: diagram.id,
            sourceClassId: sourceClass.id,
            targetClassId: assocClass.id,
            type: RelationshipType.ASSOCIATION,
            edgeStyle: EdgeStyle.ORTHOGONAL_SOFT,
            name: '«asociación»',
          },
        });

        return { assocClass, auxRel };
      });

      return {
        statusCode: 201,
        message: 'Clase asociativa creada exitosamente',
        associativeClass: result.assocClass,
        modelData: await this.getModelData(projectId),
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException({
        statusCode: 400,
        message:
          err instanceof Error
            ? err.message
            : 'Error al generar la clase asociativa',
        error: 'Bad Request',
      });
    }
  }

  async remove(ownerId: string, id: string): Promise<{ id: string }> {
    await this.getOwnedOrThrow(ownerId, id);
    // Cascada: Project -> Diagram -> ClassNode -> Attribute/Method/Relationship.
    await this.prisma.project.delete({ where: { id } });
    return { id };
  }

  /** RF4: credenciales de invitación — solo visibles para el dueño. */
  async getInviteInfo(
    ownerId: string,
    id: string,
  ): Promise<{ inviteCode: string; invitePassword: string }> {
    const project = await this.getOwnedOrThrow(ownerId, id);
    return {
      inviteCode: project.inviteCode,
      invitePassword: project.invitePassword,
    };
  }

  /** RF4/RF10: valida (código, contraseña) y une al usuario como colaborador. */
  async join(
    userId: string,
    dto: JoinProjectDto,
  ): Promise<{ id: string; name: string; role: ProjectRole }> {
    const code = dto.code?.trim().toUpperCase();
    const password = dto.password?.trim();
    if (!code || !password) {
      throw new BadRequestException('Código y contraseña son obligatorios');
    }

    const project = await this.prisma.project.findUnique({
      where: { inviteCode: code },
    });
    if (!project || project.invitePassword !== password) {
      throw new ForbiddenException('Código o contraseña incorrectos');
    }

    if (project.ownerId === userId) {
      return { id: project.id, name: project.name, role: 'OWNER' };
    }

    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId },
      update: {},
      include: { user: { select: { name: true } } },
    });

    await this.notifications.notifyOwner({
      ownerId: project.ownerId,
      projectId: project.id,
      type: 'MEMBER_JOINED',
      message: `${member.user.name} se unió a "${project.name}"`,
    });

    return { id: project.id, name: project.name, role: 'COLLABORATOR' };
  }

  /** RF9: historial de guardados del diagrama (dueño o colaborador pueden verlo). */
  async getHistory(
    userId: string,
    id: string,
    limit = 50,
  ): Promise<ProjectActivityEntry[]> {
    await this.getAccessibleOrThrow(userId, id);
    const activities = await this.prisma.projectActivity.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    });
    return activities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      createdAt: activity.createdAt,
      user: activity.user,
    }));
  }

  /**
   * Chat en tiempo real: historial reciente de mensajes del proyecto (dueño o
   * colaborador pueden verlo), en orden cronológico ascendente para pintarlo
   * directamente en el panel de chat.
   */
  async getChatHistory(
    userId: string,
    id: string,
    limit = 50,
  ): Promise<ChatMessageEntry[]> {
    await this.getAccessibleOrThrow(userId, id);
    const messages = await this.prisma.chatMessage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    });
    return messages.reverse().map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      projectId: message.projectId,
      user: message.user,
    }));
  }

  /**
   * Chat en tiempo real: persiste un mensaje enviado desde el gateway
   * (evento `send-message`, ver DiagramGateway) para que quede en el
   * historial y se pueda recuperar al recargar el editor.
   */
  async createChatMessage(
    userId: string,
    id: string,
    content: string,
  ): Promise<ChatMessageEntry> {
    await this.getAccessibleOrThrow(userId, id);
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('El mensaje no puede estar vacío');
    }
    const message = await this.prisma.chatMessage.create({
      data: { projectId: id, userId, content: trimmed },
      include: { user: { select: { id: true, name: true } } },
    });
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      projectId: message.projectId,
      user: message.user,
    };
  }

  /**
   * RF7/RF14: filas normalizadas listas para el generador Spring Boot, sin
   * pasar por el formateo a string que usa el editor (evita un viaje
   * structured -> string -> structured innecesario).
   */
  async getDiagramForGenerator(
    userId: string,
    id: string,
  ): Promise<DiagramForGenerator> {
    const { project } = await this.getAccessibleOrThrow(userId, id);
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId: id },
      include: {
        classes: {
          include: { attributes: { orderBy: { orderIndex: 'asc' } } },
        },
        relationships: true,
      },
    });
    if (!diagram)
      return { projectName: project.name, classes: [], relationships: [] };

    return {
      projectName: project.name,
      classes: diagram.classes.map((classRow) => ({
        id: classRow.id,
        name: classRow.name,
        attributes: classRow.attributes.map((attr) => ({
          name: attr.name,
          type: attr.type,
        })),
      })),
      relationships: diagram.relationships.map((rel) => ({
        sourceClassId: rel.sourceClassId,
        targetClassId: rel.targetClassId,
        name: rel.name,
        sourceCardinality: rel.sourceCardinality,
        targetCardinality: rel.targetCardinality,
      })),
    };
  }

  /** RF12: filas normalizadas para exportar a XMI 2.1 (ver src/xmi). */
  async getDiagramForXmi(userId: string, id: string): Promise<DiagramForXmi> {
    const { project } = await this.getAccessibleOrThrow(userId, id);
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId: id },
      include: DIAGRAM_INCLUDE,
    });
    if (!diagram)
      return { projectName: project.name, classes: [], relationships: [] };

    return {
      projectName: project.name,
      classes: diagram.classes.map((classRow) => ({
        id: classRow.id,
        name: classRow.name,
        isAssociative: classRow.isAssociative,
        attributes: classRow.attributes.map((attr) => ({
          name: attr.name,
          type: attr.type,
          visibility: attr.visibility,
        })),
        methods: classRow.methods.map((method) => ({
          name: method.name,
          returnType: method.returnType,
          parameters: method.parameters,
          visibility: method.visibility,
        })),
      })),
      relationships: diagram.relationships.map((rel) => ({
        id: rel.id,
        type: rel.type,
        sourceClassId: rel.sourceClassId,
        targetClassId: rel.targetClassId,
        name: rel.name,
        sourceCardinality: rel.sourceCardinality,
        targetCardinality: rel.targetCardinality,
      })),
    };
  }

  /**
   * RF11 (import por imagen) / RF13 (import XMI): reemplaza el diagrama
   * completo del proyecto a partir de una estructura ya resuelta (nombres,
   * no ids) proveniente de una fuente externa. Mismo patrón transaccional
   * que updateModel (borra y recrea), pero resolviendo relaciones por
   * nombre de clase en vez de id, y con layout en grilla ya que la fuente
   * externa no trae posiciones en el lienzo.
   */
  async importStructuredModel(
    userId: string,
    id: string,
    input: StructuredDiagramInput,
    activityAction: string,
  ): Promise<{ modelData: DiagramModel }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const GRID_COLS = 4;

    await this.prisma.$transaction(async (tx) => {
      await tx.relationship.deleteMany({ where: { diagramId: diagram.id } });
      await tx.classNode.deleteMany({ where: { diagramId: diagram.id } });

      const idByName = new Map<string, string>();
      for (const [index, cls] of input.classes.entries()) {
        const name = cls.name?.trim() || `Clase${index + 1}`;
        const created = await tx.classNode.create({
          data: {
            diagramId: diagram.id,
            name,
            positionX: 80 + (index % GRID_COLS) * 260,
            positionY: 80 + Math.floor(index / GRID_COLS) * 220,
            isAssociative: Boolean(cls.isAssociative),
            attributes: {
              create: (cls.attributes ?? [])
                .filter((attr) => attr.name?.trim())
                .map((attr, attrIndex) => ({
                  name: attr.name.trim(),
                  type: attr.type?.trim() || 'String',
                  orderIndex: attrIndex,
                })),
            },
            methods: {
              create: (cls.methods ?? [])
                .filter((method) => method.name?.trim())
                .map((method, methodIndex) => ({
                  name: method.name.trim(),
                  returnType: method.returnType?.trim() || 'void',
                  parameters: method.parameters?.trim() || '',
                  orderIndex: methodIndex,
                })),
            },
          },
        });
        idByName.set(name.toLowerCase(), created.id);
      }

      for (const rel of input.relationships ?? []) {
        const sourceId = idByName.get(rel.sourceClassName.trim().toLowerCase());
        const targetId = idByName.get(rel.targetClassName.trim().toLowerCase());
        // Relación a una clase que no vino en la extracción/import: se
        // descarta en vez de fallar todo el import por un dato parcial.
        if (!sourceId || !targetId) continue;
        await tx.relationship.create({
          data: {
            diagramId: diagram.id,
            sourceClassId: sourceId,
            targetClassId: targetId,
            type:
              rel.type && VALID_RELATIONSHIP_TYPES.has(rel.type)
                ? (rel.type as RelationshipType)
                : RelationshipType.ASSOCIATION,
            name: rel.name?.trim() || null,
            sourceCardinality: rel.sourceCardinality?.trim() || null,
            targetCardinality: rel.targetCardinality?.trim() || null,
          },
        });
      }

      await tx.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await tx.projectActivity.create({
        data: { projectId: id, userId, action: activityAction },
      });
    });

    return { modelData: await this.getModelData(id) };
  }

  /**
   * RF11: mutaciones puntuales sobre el diagrama para el asistente de IA
   * (ver src/ia). A diferencia de updateModel (reemplazo total del
   * diagrama), cada una toca solo lo que pide el comando en lenguaje
   * natural sin afectar el resto — así el asistente puede "crear la clase
   * Cliente" sin arriesgar el resto del diagrama. Todas devuelven el
   * modelData actualizado para que el asistente lo retransmita por
   * WebSocket (RF10) a los demás colaboradores conectados.
   */
  async aiCreateClass(
    userId: string,
    id: string,
    input: {
      name: string;
      attributes?: Array<{ name: string; type?: string }>;
      methods?: Array<{
        name: string;
        returnType?: string;
        parameters?: string;
      }>;
    },
  ): Promise<{ modelData: DiagramModel; className: string }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const classRow = await this.prisma.classNode.create({
      data: {
        diagramId: diagram.id,
        name: input.name.trim() || 'Clase',
        // Posición aproximada y aleatoria: el usuario la puede arrastrar
        // luego en el lienzo; evita que todas las clases de la IA queden
        // amontonadas en el mismo punto.
        positionX: 80 + Math.random() * 420,
        positionY: 80 + Math.random() * 320,
        attributes: {
          create: (input.attributes ?? []).map((attr, index) => ({
            name: attr.name.trim() || `campo${index + 1}`,
            type: attr.type?.trim() || 'String',
            orderIndex: index,
          })),
        },
        methods: {
          create: (input.methods ?? []).map((method, index) => ({
            name: method.name.trim() || `metodo${index + 1}`,
            returnType: method.returnType?.trim() || 'void',
            parameters: method.parameters?.trim() || '',
            orderIndex: index,
          })),
        },
      },
    });
    return { modelData: await this.getModelData(id), className: classRow.name };
  }

  async aiAddAttribute(
    userId: string,
    id: string,
    input: { className: string; name: string; type?: string },
  ): Promise<{ modelData: DiagramModel }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const classRow = await this.findClassByName(diagram.id, input.className);
    const orderIndex = await this.prisma.attribute.count({
      where: { classId: classRow.id },
    });
    await this.prisma.attribute.create({
      data: {
        classId: classRow.id,
        name: input.name.trim() || 'campo',
        type: input.type?.trim() || 'String',
        orderIndex,
      },
    });
    return { modelData: await this.getModelData(id) };
  }

  async aiAddMethod(
    userId: string,
    id: string,
    input: {
      className: string;
      name: string;
      returnType?: string;
      parameters?: string;
    },
  ): Promise<{ modelData: DiagramModel }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const classRow = await this.findClassByName(diagram.id, input.className);
    const orderIndex = await this.prisma.method.count({
      where: { classId: classRow.id },
    });
    await this.prisma.method.create({
      data: {
        classId: classRow.id,
        name: input.name.trim() || 'metodo',
        returnType: input.returnType?.trim() || 'void',
        parameters: input.parameters?.trim() || '',
        orderIndex,
      },
    });
    return { modelData: await this.getModelData(id) };
  }

  async aiCreateRelationship(
    userId: string,
    id: string,
    input: {
      sourceClassName: string;
      targetClassName: string;
      name?: string;
      sourceCardinality?: string;
      targetCardinality?: string;
      relationType?: string;
      createAssociativeClass?: boolean;
    },
  ): Promise<{ modelData: DiagramModel; summary?: string }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const source = await this.findClassByName(
      diagram.id,
      input.sourceClassName,
    );
    const target = await this.findClassByName(
      diagram.id,
      input.targetClassName,
    );

    const isMany = (c?: string) =>
      Boolean(c && (c.includes('*') || c.toUpperCase() === 'N' || c.toUpperCase() === 'M'));
    const isManyToMany =
      isMany(input.sourceCardinality) && isMany(input.targetCardinality);

    if (input.createAssociativeClass || (isManyToMany && input.createAssociativeClass !== false)) {
      const res = await this.createAssociativeClass(userId, id, {
        sourceClassId: source.id,
        targetClassId: target.id,
        name: input.name,
      });
      return {
        modelData: res.modelData,
        summary: `Se creó la clase de asociación y relación muchos a muchos entre "${source.name}" y "${target.name}".`,
      };
    }

    const typeEnum =
      input.relationType &&
      Object.values(RelationshipType).includes(input.relationType as RelationshipType)
        ? (input.relationType as RelationshipType)
        : RelationshipType.ASSOCIATION;

    await this.prisma.relationship.create({
      data: {
        diagramId: diagram.id,
        sourceClassId: source.id,
        targetClassId: target.id,
        type: typeEnum,
        name: input.name?.trim() || null,
        sourceCardinality: input.sourceCardinality?.trim() || null,
        targetCardinality: input.targetCardinality?.trim() || null,
      },
    });
    return {
      modelData: await this.getModelData(id),
      summary: `Se creó la relación (${typeEnum}) entre "${source.name}" y "${target.name}".`,
    };
  }

  async aiDeleteClass(
    userId: string,
    id: string,
    input: { className: string },
  ): Promise<{ modelData: DiagramModel }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const classRow = await this.findClassByName(diagram.id, input.className);
    // Cascada: se borran también sus atributos/métodos y las relaciones
    // donde esta clase era origen o destino.
    await this.prisma.classNode.delete({ where: { id: classRow.id } });
    return { modelData: await this.getModelData(id) };
  }

  async aiUpdateClass(
    userId: string,
    id: string,
    input: {
      targetClassName: string;
      newClassName?: string;
      attributesToAdd?: Array<{ name: string; type?: string }>;
      methodsToAdd?: Array<{
        name: string;
        returnType?: string;
        parameters?: string;
      }>;
    },
  ): Promise<{ modelData: DiagramModel; summary: string }> {
    const diagram = await this.getOwnDiagramOrThrow(userId, id);
    const classRow = await this.findClassByName(
      diagram.id,
      input.targetClassName,
    );

    const changes: string[] = [];

    // Renombrar clase
    if (
      input.newClassName &&
      input.newClassName.trim() &&
      input.newClassName.trim() !== classRow.name
    ) {
      const newName = input.newClassName.trim();
      await this.prisma.classNode.update({
        where: { id: classRow.id },
        data: { name: newName },
      });
      changes.push(`renombró "${classRow.name}" a "${newName}"`);
    }

    // Agregar atributos
    if (input.attributesToAdd?.length) {
      const currentAttrCount = await this.prisma.attribute.count({
        where: { classId: classRow.id },
      });
      for (const [idx, attr] of input.attributesToAdd.entries()) {
        await this.prisma.attribute.create({
          data: {
            classId: classRow.id,
            name: attr.name.trim(),
            type: attr.type?.trim() || 'String',
            orderIndex: currentAttrCount + idx,
          },
        });
      }
      changes.push(`se agregaron ${input.attributesToAdd.length} atributo(s)`);
    }

    // Agregar métodos
    if (input.methodsToAdd?.length) {
      const currentMethCount = await this.prisma.method.count({
        where: { classId: classRow.id },
      });
      for (const [idx, meth] of input.methodsToAdd.entries()) {
        await this.prisma.method.create({
          data: {
            classId: classRow.id,
            name: meth.name.trim(),
            returnType: meth.returnType?.trim() || 'void',
            parameters: meth.parameters?.trim() || '',
            orderIndex: currentMethCount + idx,
          },
        });
      }
      changes.push(`se agregaron ${input.methodsToAdd.length} método(s)`);
    }

    const summary = changes.length
      ? `En la clase "${classRow.name}": ${changes.join(', ')}.`
      : `No se realizaron cambios en "${classRow.name}".`;

    return { modelData: await this.getModelData(id), summary };
  }

  /** Diagrama del proyecto (dueño o colaborador), ya listo para React Flow. */
  private async getModelData(projectId: string): Promise<DiagramModel> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId },
      include: DIAGRAM_INCLUDE,
    });
    return diagram ? this.toDiagramModel(diagram) : { nodes: [], edges: [] };
  }

  /** Valida acceso y devuelve el Diagram del proyecto (siempre existe, ver create()). */
  private async getOwnDiagramOrThrow(userId: string, projectId: string) {
    await this.getAccessibleOrThrow(userId, projectId);
    return this.prisma.diagram.findUniqueOrThrow({ where: { projectId } });
  }

  /** Busca una clase del diagrama por nombre (sin distinguir mayúsculas). */
  private async findClassByName(diagramId: string, name: string) {
    const trimmed = name.trim();
    const classRow = await this.prisma.classNode.findFirst({
      where: { diagramId, name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (!classRow) {
      throw new NotFoundException(
        `No existe una clase llamada "${trimmed}" en este diagrama`,
      );
    }
    return classRow;
  }

  /** Busca el proyecto y comprueba que pertenece al usuario (dueño). */
  private async getOwnedOrThrow(ownerId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    if (project.ownerId !== ownerId) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    return project;
  }

  /** Busca el proyecto y comprueba que el usuario es dueño o colaborador. */
  async getAccessibleOrThrow(
    userId: string,
    id: string,
  ): Promise<{ project: Project; role: ProjectRole }> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    if (project.ownerId === userId) {
      return { project, role: 'OWNER' };
    }
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    return { project, role: 'COLLABORATOR' };
  }

  /** Convierte el diagrama relacional a la forma { nodes, edges } de React Flow. */
  private toDiagramModel(diagram: {
    classes: Array<{
      id: string;
      name: string;
      positionX: number;
      positionY: number;
      isAssociative: boolean;
      attributes: Array<{ name: string; type: string }>;
      methods: Array<{ name: string; parameters: string; returnType: string }>;
    }>;
    relationships: Array<{
      id: string;
      sourceClassId: string;
      targetClassId: string;
      name: string | null;
      sourceCardinality: string | null;
      targetCardinality: string | null;
      type: RelationshipType;
      sourceRole: string | null;
      targetRole: string | null;
      edgeStyle: EdgeStyle;
    }>;
  }): DiagramModel {
    const classById = new Map(diagram.classes.map((c) => [c.id, c]));

    return {
      nodes: diagram.classes.map((classRow) => ({
        id: classRow.id,
        type: 'classNode',
        position: { x: classRow.positionX, y: classRow.positionY },
        data: {
          name: classRow.name,
          attributes: classRow.attributes.map(formatAttributeLine),
          methods: classRow.methods.map(formatMethodLine),
          isAssociative: classRow.isAssociative,
        },
      })),
      edges: diagram.relationships.map((rel) => {
        const src = classById.get(rel.sourceClassId);
        const tgt = classById.get(rel.targetClassId);
        let sourceHandle = 'right-source';
        let targetHandle = 'left-target';
        const isAux = Boolean(tgt?.isAssociative || src?.isAssociative);

        if (src && tgt) {
          if (tgt.isAssociative) {
            sourceHandle = 'bottom-source';
            targetHandle = 'top-target';
          } else if (src.isAssociative) {
            sourceHandle = 'top-source';
            targetHandle = 'bottom-target';
          } else {
            const dx = tgt.positionX - src.positionX;
            const dy = tgt.positionY - src.positionY;
            if (Math.abs(dx) >= Math.abs(dy)) {
              sourceHandle = dx >= 0 ? 'right-source' : 'left-source';
              targetHandle = dx >= 0 ? 'left-target' : 'right-target';
            } else {
              sourceHandle = dy >= 0 ? 'bottom-source' : 'top-source';
              targetHandle = dy >= 0 ? 'top-target' : 'bottom-target';
            }
          }
        }

        let mainEdgeId: string | undefined = undefined;
        if (isAux) {
          const normalEdge = diagram.relationships.find(
            (r) =>
              r.id !== rel.id &&
              (r.sourceClassId === rel.sourceClassId ||
                r.targetClassId === rel.sourceClassId ||
                r.sourceClassId === rel.targetClassId ||
                r.targetClassId === rel.targetClassId) &&
              !classById.get(r.sourceClassId)?.isAssociative &&
              !classById.get(r.targetClassId)?.isAssociative,
          );
          if (normalEdge) {
            mainEdgeId = normalEdge.id;
          }
        }

        return {
          id: rel.id,
          source: rel.sourceClassId,
          target: rel.targetClassId,
          sourceHandle,
          targetHandle,
          type: 'customEdge',
          data: {
            relationName: rel.name ?? '',
            sourceCardinality: rel.sourceCardinality ?? '',
            targetCardinality: rel.targetCardinality ?? '',
            relationType: rel.type,
            sourceRole: rel.sourceRole ?? '',
            targetRole: rel.targetRole ?? '',
            edgeStyle: rel.edgeStyle,
            isAuxiliary: isAux,
            mainEdgeId,
          },
        };
      }),
    };
  }

  /** Oculta la contraseña de invitación a quien no sea el dueño. */
  private redactInvite<T extends { role: ProjectRole; invitePassword: string }>(
    project: T,
  ): T {
    if (project.role === 'OWNER') return project;
    return { ...project, invitePassword: '' };
  }
}
