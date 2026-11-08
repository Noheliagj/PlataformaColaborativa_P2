import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  HelpCircle,
  Layers,
  Lightbulb,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Users,
  X,
  Compass,
} from 'lucide-react';

export type HelpCategory = 'all' | 'colaboracion' | 'uml' | 'ia' | 'export' | 'movil';

export interface GuideTopic {
  id: string;
  category: HelpCategory;
  categoryLabel: string;
  categoryBadge: string;
  title: string;
  description: string;
  steps: string[];
  tip?: string;
  icon: typeof HelpCircle;
}

const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'compartir-invitar',
    category: 'colaboracion',
    categoryLabel: 'Colaboración',
    categoryBadge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    title: '¿Cómo puedo compartir mi proyecto e invitar colaboradores?',
    description:
      'Invita a tus compañeros de equipo a unirse a tu sala de modelado en tiempo real con credenciales seguras de acceso.',
    steps: [
      'En el Dashboard principal, ubica la tarjeta de tu proyecto y pulsa el botón de "Invitar" (icono de enlace / usuarios).',
      'El sistema copiará automáticamente al portapapeles el enlace directo, el Código de Invitación (ej. UML-ABC1234) y la Contraseña de Acceso.',
      'Comparte el código y la contraseña con tus compañeros de equipo.',
      'Tu compañero debe ingresar al Dashboard, hacer clic en "Unirme a cooperativo", ingresar el código y la contraseña, y quedará vinculado como Colaborador al instante.',
    ],
    tip: 'Todos los colaboradores conectados verán el diagrama en vivo y recibirán notificaciones flotantes automáticas cada vez que se guarde un cambio.',
    icon: Share2,
  },
  {
    id: 'crear-clases-relaciones',
    category: 'uml',
    categoryLabel: 'Modelado UML',
    categoryBadge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    title: '¿Cómo creo clases, atributos, métodos y relaciones en el diagrama?',
    description:
      'Utiliza el lienzo interactivo de ReactFlow para diseñar tu arquitectura orientada a objetos de forma intuitiva.',
    steps: [
      'Haz clic en tu proyecto para ingresar al Editor en Vivo.',
      'En la barra lateral flotante de herramientas, haz clic en "Nueva Clase" (+). Aparecerá un nuevo nodo en el lienzo.',
      'Haz clic sobre la clase para editar su nombre, agregar o quitar atributos con visibilidad (+, -, #, ~) y tipo de dato, y definir métodos con parámetros y retornos.',
      'Para crear relaciones, arrastra desde el conector de una clase hacia otra. Podrás configurar cardinalidades (1, 0..*, 1..*) y el tipo (Asociación, Herencia, Agregación, Composición o Clase Asociativa N:M).',
    ],
    tip: 'Puedes activar la herramienta "Seleccionar área" en la barra del lienzo para mover múltiples clases en bloque sin perder sus distancias relativas.',
    icon: Layers,
  },
  {
    id: 'deshacer-rehacer',
    category: 'uml',
    categoryLabel: 'Modelado UML',
    categoryBadge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    title: '¿Cómo puedo deshacer o rehacer cambios en el lienzo?',
    description:
      'Recupera estados anteriores de forma fluida si te equivocas al mover, eliminar o crear elementos.',
    steps: [
      'En la barra flotante de herramientas sobre el lienzo, encontrarás los botones "Deshacer" y "Rehacer".',
      'También puedes usar los atajos de teclado estándar: pulsa Ctrl+Z para Deshacer el último cambio y Ctrl+Y (o Ctrl+Shift+Z) para Rehacerlo.',
      'El historial local preserva la pila de cambios tanto para clases como para relaciones y posiciones espaciales.',
    ],
    tip: 'La pila se sincroniza con el estado local del editor para que puedas retroceder y avanzar con total seguridad.',
    icon: Layers,
  },
  {
    id: 'ia-colaborativa',
    category: 'ia',
    categoryLabel: 'IA Colaborativa',
    categoryBadge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    title: '¿Cómo funciona la IA Colaborativa y el Tool Calling en vivo?',
    description:
      'El Asistente UML actúa como un desarrollador inteligente compartido por todo el equipo dentro de la sala.',
    steps: [
      'En la cabecera superior del editor, activa el interruptor "Modo IA".',
      'Se desplegará el panel lateral del Asistente UML con chat grupal compartido en MongoDB.',
      'Escribe tu instrucción en lenguaje natural (ej. "Crea la clase Factura con id, fecha y total", o "Crea una relación de 1 a N entre Cliente y Pedido").',
      'También puedes hacer clic en el botón de Micrófono para dictar tus comandos por voz.',
      'La IA ejecutará las herramientas correspondientes (Tool Calling: create_class, create_relationship, etc.) y emitirá el cambio instantáneamente por WebSockets para todos los colaboradores y la app móvil.',
    ],
    tip: 'Usa los botones rápidos "Auditar Diagrama" (para detectar inconsistencias UML o clases vacías) y "Resumen de Avances" para poner al día a los integrantes.',
    icon: Sparkles,
  },
  {
    id: 'auditoria-historial',
    category: 'colaboracion',
    categoryLabel: 'Colaboración',
    categoryBadge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    title: '¿Cómo revisar la trazabilidad y quién modificó el modelo?',
    description:
      'Consulta la auditoría completa de modificaciones con fecha exacta, autor y tipo de operación realizada.',
    steps: [
      'En el encabezado del editor, pulsa en el botón "Historial".',
      'Se abrirá el modal de Auditoría y Trazabilidad de Cambios con una línea de tiempo visual conectada.',
      'Podrás ver exactamente quién realizó cada modificación (con avatares de color), la fecha y hora completa con segundos, y la etiqueta de la acción (Guardado manual, IA Tool Calling, Importación XMI o Creación asociativa).',
      'Utiliza el buscador por texto y los filtros por categoría para auditar cambios pasados al instante.',
    ],
    tip: 'Puedes pulsar el botón "Actualizar" dentro del panel para refrescar los últimos eventos sin salir del modal.',
    icon: Users,
  },
  {
    id: 'exportar-spring-boot-xmi',
    category: 'export',
    categoryLabel: 'Exportación & Código',
    categoryBadge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    title: '¿Cómo exporto mi proyecto a Spring Boot o estándar XMI 2.1?',
    description:
      'Convierte tu modelo visual en código Java backend ejecutable o en archivos interoperables para otras herramientas UML.',
    steps: [
      'En la barra lateral de herramientas del editor, haz clic en "Exportar Spring Boot".',
      'El servidor generará y descargará automáticamente un archivo ZIP con el proyecto Maven, entidades JPA con anotaciones relacionales (@Entity, @OneToMany, @ManyToMany), repositorios y controladores listos para compilar.',
      'Para exportar en formato interoperable con Enterprise Architect o Visual Paradigm, haz clic en "Exportar XMI" (formato estándar OMG XMI 2.1).',
      'Para descargar una imagen nítida de tu diagrama para informes o presentaciones, haz clic en "Exportar Imagen" (formato PNG).',
    ],
    tip: 'El generador de Spring Boot deduce tipos de datos, llaves foráneas y clases intermedias automáticamente.',
    icon: Download,
  },
  {
    id: 'importar-vision-ia',
    category: 'ia',
    categoryLabel: 'IA Visión',
    categoryBadge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    title: '¿Cómo importar diagramas desde fotos o bocetos a mano?',
    description:
      'Digitaliza diagramas dibujados en papel o capturas de pantalla conservando la distribución espacial original.',
    steps: [
      'En la barra de herramientas del editor, haz clic en "Importar Imagen".',
      'Selecciona una foto nítida de una pizarra, boceto en cuaderno o captura digital de un diagrama de clases.',
      'El modelo de Visión de la IA analizará los nodos, nombres, atributos, tipos y relaciones.',
      'El sistema calculará las coordenadas de la imagen para que las clases resultantes aparezcan en el lienzo respetando su posición relativa sin amontonarse en el origen.',
    ],
    tip: 'Asegúrate de que la foto tenga buena iluminación y que los nombres de las clases sean legibles.',
    icon: Bot,
  },
  {
    id: 'app-movil-flutter',
    category: 'movil',
    categoryLabel: 'App Móvil Flutter',
    categoryBadge: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    title: '¿Cómo conectar y monitorear el proyecto desde la App Móvil Flutter?',
    description:
      'Visualiza la pizarra 2D en vivo, explora tarjetas de clases y recibe alertas en tiempo real desde tu dispositivo móvil.',
    steps: [
      'Abre la app Flutter (mobile_flutter) en tu teléfono o emulador.',
      'En la pantalla de login, ingresa la IP y puerto de tu backend NestJS (ej. 192.168.1.50:3000 o localhost:3000).',
      'Inicia sesión con tus credenciales registradas.',
      'Selecciona el proyecto en la lista: el visor se conectará a la sala WebSockets con rol de observador.',
      'Disfruta de la Pizarra Táctil Interactiva (paneo libre, zoom suave), la vista de Tarjetas con búsqueda rápida y el Feed de Actividad con banners flotantes en tiempo real cada vez que alguien guarde el diagrama en la web.',
    ],
    tip: 'Si cambias de Wi-Fi o bloqueas la pantalla, la app se reconecta automáticamente a la sala sin interrumpir tu navegación.',
    icon: Smartphone,
  },
];

interface HelpGuideAssistantProps {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}

export function HelpGuideAssistant({
  open,
  onClose,
  onStartTour,
}: HelpGuideAssistantProps) {
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>('compartir-invitar');
  const [customQuestion, setCustomQuestion] = useState('');
  const [simulatedAnswer, setSimulatedAnswer] = useState<{
    query: string;
    answer: string;
    steps?: string[];
  } | null>(null);

  const filteredTopics = useMemo(() => {
    return GUIDE_TOPICS.filter((topic) => {
      if (selectedCategory !== 'all' && topic.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = topic.title.toLowerCase().includes(q);
        const matchesDesc = topic.description.toLowerCase().includes(q);
        const matchesSteps = topic.steps.some((s) => s.toLowerCase().includes(q));
        return matchesTitle || matchesDesc || matchesSteps;
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  function handleQuickQuestion(query: string) {
    setCustomQuestion(query);
    handleAsk(query);
  }

  function handleAsk(queryToUse?: string) {
    const q = (queryToUse ?? customQuestion).trim().toLowerCase();
    if (!q) return;

    // Buscar en tópicos existentes
    const matched = GUIDE_TOPICS.find(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );

    if (matched) {
      setExpandedId(matched.id);
      setSelectedCategory('all');
      setSearchQuery('');
      setSimulatedAnswer({
        query: queryToUse ?? customQuestion,
        answer: `Encontré la guía exacta para tu consulta: "${matched.title}". Aquí tienes los pasos recomendados:`,
        steps: matched.steps,
      });
    } else if (q.includes('compartir') || q.includes('invitar') || q.includes('amigo') || q.includes('unir')) {
      const topic = GUIDE_TOPICS[0];
      setExpandedId(topic.id);
      setSimulatedAnswer({
        query: queryToUse ?? customQuestion,
        answer: 'Para compartir tu proyecto, copia el código y contraseña desde el botón de invitación en tu proyecto y compártelos con tus compañeros.',
        steps: topic.steps,
      });
    } else if (q.includes('ia') || q.includes('asistente') || q.includes('bot') || q.includes('voz')) {
      const topic = GUIDE_TOPICS[3];
      setExpandedId(topic.id);
      setSimulatedAnswer({
        query: queryToUse ?? customQuestion,
        answer: 'La IA colaborativa se activa desde la barra superior pulsando "Modo IA". Ejecuta Tool Calling para crear clases y relaciones automáticamente.',
        steps: topic.steps,
      });
    } else if (q.includes('spring') || q.includes('codigo') || q.includes('exportar') || q.includes('xmi')) {
      const topic = GUIDE_TOPICS[5];
      setExpandedId(topic.id);
      setSimulatedAnswer({
        query: queryToUse ?? customQuestion,
        answer: 'Puedes exportar a Spring Boot (ZIP con JPA y Maven) o a formato XMI 2.1 desde los botones de la barra lateral del editor.',
        steps: topic.steps,
      });
    } else {
      setSimulatedAnswer({
        query: queryToUse ?? customQuestion,
        answer: `He analizado tu consulta sobre "${queryToUse ?? customQuestion}". Te recomiendo explorar nuestras guías paso a paso categorizadas a continuación o iniciar el Recorrido Guiado Interactivo:`,
        steps: [
          'Revisa las preguntas frecuentes ordenadas por categorías (Colaboración, UML, IA o App Móvil).',
          'Si prefieres una demostración visual interactiva sobre la interfaz, inicia el Recorrido Guiado con el botón inferior.',
        ],
      });
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-[2px] animate-fade-rise"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90vh] max-h-[720px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-hairline bg-raised px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-500/40 bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <Compass size={22} className="animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink tracking-tight">
                  Asistente Guía & Centro de Ayuda
                </h2>
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                  UML Studio UX
                </span>
              </div>
              <p className="text-[12px] text-ink-muted">
                Preguntas frecuentes, pasos interactivos y orientación rápida de la plataforma.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-[12px] font-bold text-purple-600 dark:text-purple-300 transition-colors hover:bg-purple-500/25"
            >
              <Sparkles size={14} className="text-purple-500" />
              <span>Ver Tutorial</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-overlay hover:text-ink"
              aria-label="Cerrar guía"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Buscador Interactivo / Chat de Orientación */}
        <div className="border-b border-hairline bg-sunken p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="text"
                value={customQuestion}
                onChange={(e) => {
                  setCustomQuestion(e.target.value);
                  setSearchQuery(e.target.value);
                  if (simulatedAnswer) setSimulatedAnswer(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="Escribe tu duda (ej. ¿Cómo compartir mi proyecto?, ¿Cómo funciona la IA?)..."
                className="w-full rounded-xl border border-hairline-strong bg-surface py-2.5 pl-10 pr-4 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent shadow-inner"
              />
            </div>
            <button
              type="button"
              onClick={() => handleAsk()}
              disabled={!customQuestion.trim()}
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/50 bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
            >
              <span>Consultar</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Sugerencias Rápidas */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
            <span className="shrink-0 text-ink-muted font-medium">Sugerencias:</span>
            {[
              '¿Cómo comparto mi proyecto?',
              '¿Cómo funciona la IA?',
              '¿Cómo exporto a Spring Boot?',
              '¿Cómo deshacer cambios?',
              '¿Cómo usar la App Móvil?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuickQuestion(q)}
                className="shrink-0 rounded-full border border-hairline bg-surface px-2.5 py-1 text-ink-soft transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Respuesta simulada interactiva */}
          {simulatedAnswer && (
            <div className="mt-3 animate-fade-rise rounded-xl border border-sky-500/35 bg-sky-500/10 p-3.5 text-[12px] shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold">
                  <Bot size={15} />
                  <span>Respuesta del Asistente Guía:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSimulatedAnswer(null)}
                  className="text-ink-muted hover:text-ink"
                >
                  <X size={13} />
                </button>
              </div>
              <p className="text-ink leading-relaxed font-medium">
                {simulatedAnswer.answer}
              </p>
              {simulatedAnswer.steps && (
                <div className="mt-2.5 space-y-1.5 rounded-lg border border-hairline bg-surface p-2.5">
                  {simulatedAnswer.steps.map((st, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-ink-soft">
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{st}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filtros de Categoría */}
        <div className="flex items-center gap-1.5 border-b border-hairline bg-raised px-6 py-2.5 overflow-x-auto">
          {[
            { id: 'all', label: 'Todas las guías' },
            { id: 'colaboracion', label: 'Colaboración & Invitaciones' },
            { id: 'uml', label: 'Lienzo & Modelado UML' },
            { id: 'ia', label: 'IA Colaborativa' },
            { id: 'export', label: 'Spring Boot & XMI' },
            { id: 'movil', label: 'App Móvil Flutter' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id as HelpCategory)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'border border-hairline bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Contenido: Acordeón interactivo de Guías */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-surface">
          {filteredTopics.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-hairline bg-raised text-ink-muted">
                <HelpCircle size={22} />
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">
                No encontramos guías con ese término
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Prueba buscando palabras como "compartir", "invitar", "ia", "clase", "spring" o "móvil".
              </p>
            </div>
          ) : (
            filteredTopics.map((topic) => {
              const isExpanded = expandedId === topic.id;
              const IconComp = topic.icon;

              return (
                <div
                  key={topic.id}
                  className={`overflow-hidden rounded-xl border transition-all ${
                    isExpanded
                      ? 'border-accent/50 bg-raised shadow-md'
                      : 'border-hairline bg-raised/50 hover:border-hairline-strong hover:bg-raised'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : topic.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-500">
                        <IconComp size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-[13.5px] font-bold text-ink">
                            {topic.title}
                          </h3>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${topic.categoryBadge}`}
                          >
                            {topic.categoryLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-ink-muted line-clamp-1">
                          {topic.description}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-ink-muted">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-hairline bg-surface/50 px-4 pt-3 pb-4 space-y-3">
                      <p className="text-[12.5px] text-ink-soft font-medium">
                        {topic.description}
                      </p>

                      <div className="space-y-2 rounded-xl border border-hairline bg-surface p-3.5">
                        <p className="text-[11px] font-bold tracking-wider text-sky-600 dark:text-sky-400 uppercase">
                          Pasos a seguir:
                        </p>
                        <div className="space-y-2">
                          {topic.steps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-[12px] text-ink-soft">
                              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-sky-500/40 bg-sky-500/15 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {topic.tip && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11.5px] text-amber-800 dark:text-amber-200">
                          <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-500" />
                          <span>
                            <strong className="text-amber-900 dark:text-amber-300 font-semibold">Consejo Pro: </strong>
                            {topic.tip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pie con botón de Recorrido Guiado */}
        <div className="flex items-center justify-between border-t border-hairline bg-raised px-6 py-3">
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <CheckCircle2 size={15} className="text-emerald-500" />
            <span>Guías sincronizadas con la versión actual de la plataforma</span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartTour();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-purple-500/50 bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-[12px] font-bold text-white shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all hover:brightness-110"
          >
            <Sparkles size={14} className="text-amber-300" />
            <span>Iniciar Recorrido Guiado (Tutorial)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
