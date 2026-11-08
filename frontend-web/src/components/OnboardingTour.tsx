import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  FolderPlus,
  Layers,
  LayoutGrid,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';

interface TourStep {
  id: string;
  targetSelector?: string;
  icon: ReactNode;
  title: string;
  badge: string;
  body: ReactNode;
  highlights?: string[];
  preferredPosition?: 'bottom' | 'top' | 'center' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'workspace',
    targetSelector: '[data-tour="workspace-header"]',
    icon: <LayoutGrid size={22} className="text-sky-400" />,
    badge: 'Paso 1: Tu Espacio',
    title: '¡Bienvenido a UML Studio!',
    body: (
      <>
        Este es tu panel central de control. Aquí gestionas todos tus proyectos
        de diagramas de clases, supervisas el estado de sincronización y
        accedes rápidamente a tus espacios de trabajo.
      </>
    ),
    highlights: ['Catálogo de proyectos', 'Roles de dueño o colaborador', 'Sincronización en vivo'],
    preferredPosition: 'bottom',
  },
  {
    id: 'quick-actions',
    targetSelector: '[data-tour="quick-actions"]',
    icon: <FolderPlus size={22} className="text-emerald-400" />,
    badge: 'Paso 2: Proyectos & Trabajo en Equipo',
    title: 'Crear o Unirse a un Proyecto',
    body: (
      <>
        Pulsa <strong className="text-white">"Nuevo proyecto"</strong> para diseñar tu arquitectura desde cero, o{' '}
        <strong className="text-white">"Unirme a cooperativo"</strong> si un compañero te compartió un código y contraseña de invitación.
      </>
    ),
    highlights: ['Creación en 1 clic', 'Acceso seguro por código', 'Salas compartidas'],
    preferredPosition: 'bottom',
  },
  {
    id: 'project-card',
    targetSelector: '[data-tour="project-card"]',
    icon: <Share2 size={22} className="text-sky-400" />,
    badge: 'Paso 3: Invitaciones',
    title: 'Compartir e Invitar Colaboradores',
    body: (
      <>
        Cada proyecto te permite invitar a tu equipo con un solo clic. Pulsa el botón de enlace para copiar
        automáticamente el enlace directo, el código y la contraseña de acceso seguro.
      </>
    ),
    highlights: ['Enlace al portapapeles', 'Contraseña protegida', 'Alertas cuando se unen'],
    preferredPosition: 'bottom',
  },
  {
    id: 'editor-canvas',
    targetSelector: '[data-tour="editor-open-action"]',
    icon: <Layers size={22} className="text-purple-400" />,
    badge: 'Paso 4: Editor & Lienzo',
    title: 'Lienzo UML con Deshacer y Rehacer',
    body: (
      <>
        Entra al editor en vivo para crear clases, atributos, métodos y relaciones tipadas (incluyendo clases de asociación N:M).
        Cuentas con botones y atajos de <strong className="text-white">Deshacer (Ctrl+Z)</strong> y <strong className="text-white">Rehacer (Ctrl+Y)</strong>, y selección múltiple.
      </>
    ),
    highlights: ['ReactFlow interactivo', 'Pila de Undo/Redo', 'Selección grupal'],
    preferredPosition: 'top',
  },
  {
    id: 'ai-mode',
    targetSelector: undefined, // Centro visual
    icon: <Sparkles size={22} className="text-amber-300 animate-pulse" />,
    badge: 'Paso 5: Inteligencia Artificial',
    title: 'Modo IA Colaborativa & Tool Calling',
    body: (
      <>
        En la barra superior del editor, activa el <strong className="text-white">"Modo IA"</strong> para chatear o dictar por voz.
        La IA ejecutará herramientas directas sobre el lienzo (Tool Calling) creando clases y relaciones que todos los conectados verán al instante.
      </>
    ),
    highlights: ['Dictado por voz', 'Auditoría automática', 'Tool Calling sincronizado'],
    preferredPosition: 'center',
  },
  {
    id: 'guide-assistant',
    targetSelector: '[data-tour="guide-assistant-btn"]',
    icon: <Compass size={22} className="text-sky-400" />,
    badge: 'Paso 6: Centro de Ayuda',
    title: 'Asistente Guía Disponible 24/7',
    body: (
      <>
        ¿Dudas sobre cómo exportar a Spring Boot, XMI 2.1 o conectar la App Móvil Flutter?
        Abre en cualquier momento el <strong className="text-white">Asistente Guía</strong> para consultar preguntas frecuentes con pasos exactos.
      </>
    ),
    highlights: ['Paso a paso guiado', 'Buscador interactivo', 'Soporte Spring Boot & Móvil'],
    preferredPosition: 'top',
  },
];

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ open, onClose, onFinish }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setStepIndex(0);
  }

  const currentStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Localizar elemento objetivo en el DOM para el spotlight
  useLayoutEffect(() => {
    if (!open) {
      setTargetRect(null);
      return;
    }

    function updateTarget() {
      if (!currentStep.targetSelector) {
        setTargetRect(null);
        return;
      }

      const el = document.querySelector(currentStep.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const r = el.getBoundingClientRect();
        setTargetRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      } else {
        setTargetRect(null);
      }
    }

    updateTarget();
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    return () => {
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [open, stepIndex, currentStep.targetSelector]);

  // Manejo de atajos de teclado (Escape, Flechas)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !isLast) setStepIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && !isFirst) setStepIndex((i) => i - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, isFirst, isLast]);

  if (!open) return null;

  // Cálculo de posición de la tarjeta flotante
  let cardPositionStyle: React.CSSProperties = {};
  const isCenter = !targetRect || currentStep.preferredPosition === 'center';

  if (!isCenter && targetRect) {
    const margin = 16;
    const cardWidth = Math.min(440, window.innerWidth - 32);

    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, left));

    if (currentStep.preferredPosition === 'top') {
      const top = Math.max(margin, targetRect.top - 380);
      cardPositionStyle = { position: 'absolute', top, left, width: cardWidth };
    } else {
      const top = Math.min(window.innerHeight - 380, targetRect.top + targetRect.height + 16);
      cardPositionStyle = { position: 'absolute', top, left, width: cardWidth };
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto transition-opacity duration-300 animate-fade-rise"
      onClick={onClose}
    >
      {/* Fondo oscurecido para pasos centrados o si el selector no está en el DOM */}
      {(!targetRect || isCenter) && (
        <div className="absolute inset-0 bg-[#050a14]/80 backdrop-blur-[2px] transition-opacity duration-300 pointer-events-none" />
      )}

      {/* Spotlight Cutout 100% transparente y Borde Neón Estático (Sin parpadeo) */}
      {!isCenter && targetRect && (
        <div
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: '0 0 0 9999px rgba(5, 10, 20, 0.82), 0 0 25px 2px rgba(56, 189, 248, 0.45)',
          }}
          className="pointer-events-none absolute rounded-2xl border-2 border-sky-400/90 bg-transparent transition-all duration-300 ease-out"
        >
          <span className="absolute -top-3.5 -right-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-sky-400 to-blue-600 text-[11px] font-black text-white shadow-[0_2px_10px_rgba(56,189,248,0.5)]">
            {stepIndex + 1}
          </span>
        </div>
      )}

      {/* Tarjeta Flotante Explicativa del Tour */}
      <div
        className={
          isCenter
            ? 'fixed inset-0 flex items-center justify-center p-4 pointer-events-none'
            : ''
        }
      >
        <div
          style={!isCenter ? cardPositionStyle : {}}
          className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline-strong bg-surface shadow-[0_25px_70px_rgba(0,0,0,0.4)] animate-fade-rise"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Barra superior de acento */}
          <div className="h-1.5 w-full bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500" />

          {/* Cabecera del Paso */}
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-hairline bg-raised shadow-inner">
                {currentStep.icon}
              </div>
              <div>
                <span className="inline-block rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  {currentStep.badge}
                </span>
                <h3 className="mt-0.5 text-base font-bold text-ink tracking-tight">
                  {currentStep.title}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              title="Saltar recorrido"
              aria-label="Cerrar tour"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cuerpo */}
          <div className="p-5 space-y-4">
            <div className="text-[13px] leading-relaxed text-ink-soft">
              {currentStep.body}
            </div>

            {/* Puntos destacados del paso */}
            {currentStep.highlights && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {currentStep.highlights.map((h, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-soft"
                  >
                    <Check size={11} className="text-emerald-500" />
                    {h}
                  </span>
                ))}
              </div>
            )}

            {/* Barra de Progreso con segmentos */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[11px] font-semibold text-ink-muted">
                <span>Progreso del recorrido</span>
                <span>
                  {stepIndex + 1} de {TOUR_STEPS.length}
                </span>
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                {TOUR_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i === stepIndex
                        ? 'bg-gradient-to-r from-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                        : i < stepIndex
                        ? 'bg-sky-600'
                        : 'bg-hairline-strong'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Pie de navegación */}
          <div className="flex items-center justify-between border-t border-hairline bg-raised px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Saltar tutorial
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                disabled={isFirst}
                className="flex items-center gap-1 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-raised hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
              >
                <ArrowLeft size={14} />
                <span>Anterior</span>
              </button>

              {isLast ? (
                <button
                  type="button"
                  onClick={onFinish}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-400/50 bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-1.5 text-[12px] font-bold text-white shadow-[0_0_15px_rgba(56,189,248,0.3)] transition-all hover:brightness-110"
                >
                  <Check size={14} />
                  <span>Comenzar a modelar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStepIndex((i) => i + 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-400/50 bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-1.5 text-[12px] font-bold text-white shadow-[0_0_15px_rgba(56,189,248,0.3)] transition-all hover:brightness-110"
                >
                  <span>Siguiente</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
