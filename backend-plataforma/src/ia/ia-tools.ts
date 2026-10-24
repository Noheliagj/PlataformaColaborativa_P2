import type Anthropic from '@anthropic-ai/sdk';

/**
 * RF11: herramientas (function calling) que el asistente puede invocar para
 * operar sobre el diagrama relacional (ver ProjectsService.ai* en
 * projects.service.ts). Cada una corresponde a una operación puntual, no a
 * un reemplazo del diagrama completo.
 */
export const AI_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'create_class',
    description:
      'Crea una nueva clase UML en el diagrama actual, opcionalmente con sus atributos y métodos iniciales.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nombre de la clase, en PascalCase (ej. Cliente).',
        },
        attributes: {
          type: 'array',
          description: 'Atributos iniciales de la clase.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del atributo (ej. id, nombre).' },
              type: {
                type: 'string',
                description: 'Tipo del atributo (ej. String, int, Long). "String" si no se indica.',
              },
            },
            required: ['name'],
          },
        },
        methods: {
          type: 'array',
          description: 'Métodos iniciales de la clase.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              returnType: {
                type: 'string',
                description: 'Tipo de retorno. "void" si no se indica.',
              },
              parameters: {
                type: 'string',
                description: 'Parámetros como texto, ej. "id: Long".',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_attribute',
    description: 'Agrega un atributo a una clase que ya existe en el diagrama.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Nombre exacto de la clase existente.' },
        name: { type: 'string', description: 'Nombre del nuevo atributo.' },
        type: { type: 'string', description: 'Tipo del atributo. "String" si no se indica.' },
      },
      required: ['className', 'name'],
    },
  },
  {
    name: 'add_method',
    description: 'Agrega un método a una clase que ya existe en el diagrama.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Nombre exacto de la clase existente.' },
        name: { type: 'string', description: 'Nombre del método.' },
        returnType: { type: 'string', description: '"void" si no se indica.' },
        parameters: { type: 'string', description: 'Parámetros como texto, ej. "id: Long".' },
      },
      required: ['className', 'name'],
    },
  },
  {
    name: 'create_relationship',
    description:
      'Crea una asociación o relación UML entre dos clases existentes del diagrama, con tipo y cardinalidad opcionales (incluyendo soporte para relaciones muchos a muchos o clases de asociación).',
    input_schema: {
      type: 'object',
      properties: {
        sourceClassName: { type: 'string', description: 'Nombre de la clase de origen (ya existente).' },
        targetClassName: { type: 'string', description: 'Nombre de la clase de destino (ya existente).' },
        name: { type: 'string', description: 'Nombre o verbo de la relación, ej. "pertenece_a", "gestiona".' },
        relationType: {
          type: 'string',
          enum: ['ASSOCIATION', 'AGGREGATION', 'COMPOSITION', 'INHERITANCE', 'REALIZATION', 'DEPENDENCY'],
          description: 'Tipo de relación UML. Por defecto "ASSOCIATION".',
        },
        sourceCardinality: {
          type: 'string',
          description: 'Cardinalidad del lado origen: "1", "0..1", "N" o "0..*".',
        },
        targetCardinality: {
          type: 'string',
          description: 'Cardinalidad del lado destino: "1", "0..1", "N" o "0..*".',
        },
        createAssociativeClass: {
          type: 'boolean',
          description: 'Indica si se debe generar una clase de asociación intermedia para relaciones muchos a muchos (0..* a 0..*).',
        },
      },
      required: ['sourceClassName', 'targetClassName'],
    },
  },
  {
    name: 'update_canvas',
    description:
      'Modifica elementos existentes en el diagrama/canvas (renombrar clases, agregar o actualizar atributos y métodos existentes).',
    input_schema: {
      type: 'object',
      properties: {
        targetClassName: {
          type: 'string',
          description: 'Nombre actual de la clase a modificar.',
        },
        newClassName: {
          type: 'string',
          description: 'Nuevo nombre de la clase si se desea renombrar.',
        },
        attributesToAdd: {
          type: 'array',
          description: 'Nuevos atributos a agregar a la clase.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del atributo.' },
              type: { type: 'string', description: 'Tipo del atributo (ej. String, int).' },
            },
            required: ['name'],
          },
        },
        methodsToAdd: {
          type: 'array',
          description: 'Nuevos métodos a agregar a la clase.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del método.' },
              returnType: { type: 'string', description: 'Tipo de retorno (ej. void).' },
              parameters: { type: 'string', description: 'Parámetros del método.' },
            },
            required: ['name'],
          },
        },
      },
      required: ['targetClassName'],
    },
  },
  {
    name: 'delete_class',
    description: 'Elimina una clase existente del diagrama, junto con sus atributos, métodos y relaciones.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Nombre exacto de la clase a eliminar.' },
      },
      required: ['className'],
    },
  },
];

/**
 * Importación de diagramas por imagen (Vision, ver IaService.importFromImage):
 * a diferencia de AI_TOOLS (mutaciones puntuales sobre un diagrama que ya
 * existe), esta herramienta única extrae el diagrama COMPLETO que aparece en
 * la foto/captura en una sola llamada forzada (tool_choice), sin conversación.
 */
export const DIAGRAM_EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: 'extraer_diagrama',
  description:
    'Registra todas las clases, atributos, métodos y relaciones de un diagrama de clases UML detectadas en una imagen.',
  input_schema: {
    type: 'object',
    properties: {
      classes: {
        type: 'array',
        description: 'Todas las clases visibles en la imagen.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre de la clase (ej. Cliente).' },
            attributes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    description: 'Tipo del atributo. "String" si no es legible o no se indica.',
                  },
                },
                required: ['name'],
              },
            },
            methods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  returnType: { type: 'string', description: '"void" si no se indica.' },
                  parameters: { type: 'string', description: 'Ej. "id: Long".' },
                },
                required: ['name'],
              },
            },
          },
          required: ['name'],
        },
      },
      relationships: {
        type: 'array',
        description: 'Asociaciones o herencias entre las clases detectadas.',
        items: {
          type: 'object',
          properties: {
            sourceClassName: { type: 'string' },
            targetClassName: { type: 'string' },
            name: { type: 'string', description: 'Nombre de la relación, si tiene una.' },
            sourceCardinality: {
              type: 'string',
              description: 'Cardinalidad junto a la clase de origen: "1", "0..1", "N" o "0..*".',
            },
            targetCardinality: {
              type: 'string',
              description: 'Cardinalidad junto a la clase de destino.',
            },
            type: {
              type: 'string',
              enum: [
                'ASSOCIATION',
                'AGGREGATION',
                'COMPOSITION',
                'INHERITANCE',
                'REALIZATION',
                'DEPENDENCY',
              ],
              description:
                'Tipo UML según el símbolo dibujado en la línea, visto desde sourceClassName hacia targetClassName: ' +
                '"COMPOSITION" si el extremo en sourceClassName tiene un rombó RELLENO (el "todo" es la clase origen, la "parte" es el destino); ' +
                '"AGGREGATION" si ese mismo extremo tiene un rombó HUECO/SIN RELLENAR; ' +
                '"INHERITANCE" si hay una flecha de triángulo RELLENO/cerrado apuntando desde sourceClassName hacia targetClassName (targetClassName es la clase padre/general); ' +
                '"REALIZATION" si es una línea PUNTEADA con triángulo hueco; ' +
                '"DEPENDENCY" si es una línea PUNTEADA con flecha simple abierta; ' +
                '"ASSOCIATION" en cualquier otro caso (línea sólida sin rombó ni triángulo, con flecha simple u opcionalmente ninguna punta).',
            },
          },
          required: ['sourceClassName', 'targetClassName'],
        },
      },
    },
    required: ['classes'],
  },
};
