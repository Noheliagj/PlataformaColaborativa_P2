import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  DiagramForXmi,
  DiagramModel,
  ProjectsService,
  StructuredDiagramInput,
} from '../projects/projects.service';
import { DiagramGateway } from '../websockets/diagram.gateway';
import { NosqlService } from '../nosql/nosql.service';
import { AI_TOOLS, DIAGRAM_EXTRACTION_TOOL } from './ia-tools';
import { ChatMessageDto } from './dto/ai-chat.dto';

const DEFAULT_MODEL = 'claude-sonnet-5';
const FALLBACK_MODEL = 'claude-haiku-5-5';
const MAX_TOOL_ROUNDS = 4;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface ToolExecutionResult {
  modelData?: DiagramModel;
  summary?: string;
  error?: string;
}

/**
 * Servicio de Asistente IA (Anthropic Claude) con soporte para Tool Calling
 * y contexto grupal colaborativo en tiempo real.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null = null;
  private readonly model: string;
  private readonly apiKey: string | null;

  constructor(
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
    private readonly nosql: NosqlService,
    @Inject(forwardRef(() => DiagramGateway))
    private readonly gateway: DiagramGateway,
  ) {
    this.apiKey =
      this.config.get<string>('ANTHROPIC_API_KEY')?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      null;

    this.model =
      this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      DEFAULT_MODEL;

    if (this.apiKey && this.apiKey.length > 10 && !this.apiKey.includes('placeholder')) {
      this.client = new Anthropic({ apiKey: this.apiKey });
    } else {
      this.client = null;
    }
  }

  /**
   * Valida la presencia y configuración básica de la API Key.
   * Lanza HTTP 503 si no está configurada o es inválida.
   */
  private ensureConfigured(): Anthropic {
    if (!this.client || !this.apiKey) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message:
          'El asistente de IA no está configurado: falta ANTHROPIC_API_KEY válida en backend-plataforma/.env.',
        error: 'Service Unavailable',
      });
    }
    return this.client;
  }

  private handleAnthropicError(err: unknown): never {
    const errorMsg = (err as Error)?.message || '';
    const statusCode = (err as { status?: number })?.status;
    this.logger.error(`Error en Anthropic API: ${errorMsg}`);

    if (
      statusCode === 401 ||
      errorMsg.includes('401') ||
      errorMsg.includes('authentication') ||
      errorMsg.includes('api_key')
    ) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message:
          'La clave de Anthropic (ANTHROPIC_API_KEY) es inválida o no está autorizada. Configuración de IA no disponible.',
        error: 'Service Unavailable',
      });
    }

    if (statusCode === 404 || errorMsg.includes('404') || errorMsg.includes('model:')) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: `El modelo configurado (${this.model}) no está disponible en Anthropic para esta clave API. Modelo recomendado: "claude-sonnet-5" o "claude-haiku-5-5".`,
        error: 'Service Unavailable',
      });
    }

    throw new ServiceUnavailableException({
      statusCode: 503,
      message: `Error al comunicarse con el proveedor de IA: ${errorMsg}`,
      error: 'Service Unavailable',
    });
  }

  async chat(
    userId: string,
    userName: string,
    projectId: string,
    message: string,
    history?: ChatMessageDto[],
  ): Promise<{ reply: string; actions: string[] }> {
    const client = this.ensureConfigured();

    if (!message?.trim()) {
      throw new BadRequestException('El mensaje no puede estar vacío');
    }

    // 1. Recuperar contexto grupal NoSQL (ChatRoom)
    let groupChatContext = '';
    try {
      const room = await this.nosql.getChatHistory(projectId);
      if (room?.messages?.length) {
        // Tomar hasta los últimos 20 mensajes de la sala
        const recentMessages = room.messages.slice(-20);
        groupChatContext = recentMessages
          .map((m) => `[${m.senderName}]: ${m.content}`)
          .join('\n');
      }
    } catch (err) {
      this.logger.warn(`No se pudo leer historial grupal NoSQL: ${(err as Error).message}`);
    }

    // 2. Recuperar el estado actual del canvas/diagrama
    const diagram = await this.projects.getDiagramForXmi(userId, projectId);
    const systemPrompt = this.buildSystemPrompt(diagram, groupChatContext);

    const messages: Anthropic.Messages.MessageParam[] = [
      ...(history ?? [])
        .filter((turn) => turn.content?.trim())
        .map((turn): Anthropic.Messages.MessageParam => ({
          role: turn.role,
          content: turn.content,
        })),
      { role: 'user', content: message },
    ];

    const actions: string[] = [];
    let finalText = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let response: Anthropic.Messages.Message;
      try {
        response = await client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools: AI_TOOLS,
        });
      } catch (err: unknown) {
        const errorMsg = (err as Error)?.message || '';
        const statusCode = (err as { status?: number })?.status;

        // Si el modelo retorna 404, reintentamos automáticamente con FALLBACK_MODEL
        if ((statusCode === 404 || errorMsg.includes('404')) && this.model !== FALLBACK_MODEL) {
          this.logger.warn(
            `Modelo "${this.model}" no disponible (404). Reintentando con "${FALLBACK_MODEL}"...`,
          );
          try {
            response = await client.messages.create({
              model: FALLBACK_MODEL,
              max_tokens: 1024,
              system: systemPrompt,
              messages,
              tools: AI_TOOLS,
            });
          } catch (retryErr: unknown) {
            this.handleAnthropicError(retryErr);
          }
        } else {
          this.handleAnthropicError(err);
        }
      }

      const textBlocks = response.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
      );
      if (textBlocks.length) {
        finalText = textBlocks.map((block) => block.text).join('\n').trim();
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      if (toolUseBlocks.length === 0) break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await this.executeTool(
          userId,
          projectId,
          block.name,
          (block.input ?? {}) as Record<string, unknown>,
        );

        if (result.summary) {
          actions.push(result.summary);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.error ? `Error: ${result.error}` : result.summary || 'Operación completada con éxito.',
          is_error: Boolean(result.error),
        });

        if (result.modelData) {
          // Persistir snapshot actualizado en NoSQL
          this.nosql
            .saveCanvasSnapshot(projectId, {
              nodes: result.modelData.nodes,
              edges: result.modelData.edges,
            })
            .catch((err) =>
              this.logger.warn(`No se pudo actualizar snapshot NoSQL: ${err.message}`),
            );

          // Retransmitir actualización del canvas a todos los clientes en tiempo real
          this.gateway.broadcastDiagramUpdate(projectId, result.modelData, {
            userId,
            userName,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });

      if (response.stop_reason !== 'tool_use') break;
    }

    return { reply: finalText || 'Acciones aplicadas correctamente al diagrama.', actions };
  }

  private async executeTool(
    userId: string,
    projectId: string,
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    try {
      switch (name) {
        case 'create_class': {
          const { modelData, className } = await this.projects.aiCreateClass(userId, projectId, {
            name: String(input.name ?? ''),
            attributes: input.attributes as Array<{ name: string; type?: string }> | undefined,
            methods: input.methods as
              | Array<{ name: string; returnType?: string; parameters?: string }>
              | undefined,
          });
          return { modelData, summary: `Se creó la clase "${className}".` };
        }

        case 'create_relationship': {
          const source = String(input.sourceClassName ?? '');
          const target = String(input.targetClassName ?? '');
          const res = await this.projects.aiCreateRelationship(userId, projectId, {
            sourceClassName: source,
            targetClassName: target,
            name: input.name as string | undefined,
            sourceCardinality: input.sourceCardinality as string | undefined,
            targetCardinality: input.targetCardinality as string | undefined,
            relationType: input.relationType as string | undefined,
            createAssociativeClass: input.createAssociativeClass as boolean | undefined,
          });
          return {
            modelData: res.modelData,
            summary: res.summary || `Se creó la relación entre "${source}" y "${target}".`,
          };
        }

        case 'update_canvas': {
          const target = String(input.targetClassName ?? '');
          const res = await this.projects.aiUpdateClass(userId, projectId, {
            targetClassName: target,
            newClassName: input.newClassName as string | undefined,
            attributesToAdd: input.attributesToAdd as Array<{ name: string; type?: string }> | undefined,
            methodsToAdd: input.methodsToAdd as
              | Array<{ name: string; returnType?: string; parameters?: string }>
              | undefined,
          });
          return {
            modelData: res.modelData,
            summary: res.summary || `Se actualizó el elemento "${target}".`,
          };
        }

        case 'add_attribute': {
          const className = String(input.className ?? '');
          const { modelData } = await this.projects.aiAddAttribute(userId, projectId, {
            className,
            name: String(input.name ?? ''),
            type: input.type as string | undefined,
          });
          return { modelData, summary: `Se agregó el atributo "${input.name}" a "${className}".` };
        }

        case 'add_method': {
          const className = String(input.className ?? '');
          const { modelData } = await this.projects.aiAddMethod(userId, projectId, {
            className,
            name: String(input.name ?? ''),
            returnType: input.returnType as string | undefined,
            parameters: input.parameters as string | undefined,
          });
          return { modelData, summary: `Se agregó el método "${input.name}" a "${className}".` };
        }

        case 'delete_class': {
          const className = String(input.className ?? '');
          const { modelData } = await this.projects.aiDeleteClass(userId, projectId, { className });
          return { modelData, summary: `Se eliminó la clase "${className}".` };
        }

        default:
          return { error: `Herramienta desconocida: ${name}` };
      }
    } catch (err) {
      this.logger.warn(`Fallo al ejecutar herramienta "${name}": ${(err as Error).message}`);
      return { error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }

  async importFromImage(
    userId: string,
    userName: string,
    projectId: string,
    file: UploadedImageFile | undefined,
  ): Promise<{ modelData: DiagramModel; summary: string }> {
    const client = this.ensureConfigured();

    if (!file?.buffer?.length) {
      throw new BadRequestException('Debes subir una imagen del diagrama');
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype as AllowedImageType)) {
      throw new BadRequestException(
        'Formato de imagen no soportado (usa PNG, JPG, WEBP o GIF)',
      );
    }

    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system:
          'Eres un experto en UML. Analiza la imagen de un diagrama de clases (foto, captura o dibujo a mano) ' +
          'y usa la herramienta "extraer_diagrama" para registrar exactamente lo que ves: no inventes clases, ' +
          'atributos, métodos ni relaciones que no estén presentes en la imagen.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: file.mimetype as AllowedImageType,
                  data: file.buffer.toString('base64'),
                },
              },
              {
                type: 'text',
                text: 'Extrae todas las clases (con sus atributos y métodos) y todas las relaciones (con cardinalidad si es visible) de este diagrama de clases UML.',
              },
            ],
          },
        ],
        tools: [DIAGRAM_EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'extraer_diagrama' },
      });
    } catch (err: unknown) {
      this.handleAnthropicError(err);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );
    const extracted = toolUse?.input as StructuredDiagramInput | undefined;
    if (!extracted?.classes?.length) {
      throw new BadRequestException(
        'No se detectaron clases en la imagen. Prueba con una foto más nítida o mejor encuadrada.',
      );
    }

    const { modelData } = await this.projects.importStructuredModel(
      userId,
      projectId,
      extracted,
      'IMPORT_IMAGE',
    );

    // Persistir snapshot en NoSQL y retransmitir por WebSocket
    this.nosql
      .saveCanvasSnapshot(projectId, {
        nodes: modelData.nodes,
        edges: modelData.edges,
      })
      .catch(() => {});

    this.gateway.broadcastDiagramUpdate(projectId, modelData, { userId, userName });

    const relCount = extracted.relationships?.length ?? 0;
    return {
      modelData,
      summary:
        `Se importaron ${extracted.classes.length} clase(s)` +
        (relCount ? ` y ${relCount} relación(es)` : '') +
        ' desde la imagen.',
    };
  }

  private buildSystemPrompt(diagram: DiagramForXmi, groupChatContext: string): string {
    const classesSummary = diagram.classes.length
      ? diagram.classes
          .map((c) => {
            const attrs = c.attributes
              .map((a) => `${a.name}: ${a.type}`)
              .join(', ');
            const meths = c.methods
              .map((m) => `${m.name}(${m.parameters || ''}): ${m.returnType}`)
              .join(', ');
            return `- Clase "${c.name}": [Atributos: ${attrs || 'ninguno'}] [Métodos: ${meths || 'ninguno'}]`;
          })
          .join('\n')
      : '(No hay clases en el diagrama todavía)';

    const relationsSummary = diagram.relationships?.length
      ? diagram.relationships
          .map((r) => {
            const src =
              diagram.classes.find((c) => c.id === r.sourceClassId)?.name || r.sourceClassId;
            const tgt =
              diagram.classes.find((c) => c.id === r.targetClassId)?.name || r.targetClassId;
            return `- Relación ${r.type} de "${src}" (${r.sourceCardinality || '1'}) a "${tgt}" (${r.targetCardinality || '1'})${r.name ? ` [nombre: "${r.name}"]` : ''}`;
          })
          .join('\n')
      : '(No hay relaciones en el diagrama todavía)';

    return `Eres el asistente experto de modelado de software y diagramas de clases UML colaborativo en tiempo real.
El usuario o equipo te da instrucciones en lenguaje natural para crear o modificar clases, atributos, métodos y relaciones del lienzo.

REGLAS DE ACTUACIÓN:
1. Utiliza las herramientas (tools) disponibles para aplicar cambios reales en el modelo de datos. NUNCA respondas que hiciste un cambio sin haber llamado a la herramienta correspondiente.
   - "create_class": Para crear nuevas clases con atributos y métodos.
   - "create_relationship": Para vincular clases existentes con tipos UML y cardinalidades. Admite relaciones muchos a muchos ("0..*" a "0..*") y clases de asociación (intermedia).
   - "update_canvas": Para modificar elementos existentes (renombrar clases, añadir nuevos atributos o métodos).
2. Si el usuario no especifica tipo de dato para un atributo, usa "String". Si no especifica tipo de retorno de un método, usa "void".
3. Ten en cuenta el contexto de la conversación grupal y las decisiones previas de los usuarios.
4. Responde siempre en español, de manera concisa y clara (en 1 o 2 frases), confirmando los cambios realizados o explicando por qué no se pudo ejecutar la acción solicitada.

ESTADO ACTUAL DEL CANVAS / DIAGRAMA:
Clases existentes:
${classesSummary}

Relaciones existentes:
${relationsSummary}

${
  groupChatContext
    ? `HISTORIAL RECIENTE DEL CHAT GRUPAL (Contexto de los colaboradores):
${groupChatContext}
`
    : ''
}`;
  }
}
