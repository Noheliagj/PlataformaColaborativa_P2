import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  Cpu,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  Wand2,
  X,
} from 'lucide-react';
import type { ProjectChatMessage } from '../services/projects';

interface AiWorkspacePanelProps {
  projectId: string;
  messages: ProjectChatMessage[];
  currentUserId: string | null;
  currentUserName?: string | null;
  connected: boolean;
  isProcessing: boolean;
  onSendMessage: (content: string) => void;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  'Crea la clase Factura con id, fecha y monto',
  'Crea la clase Cliente con id, nombre y email',
  'Crea una relación de 1 a 0..* entre Cliente y Factura',
  'Crea una relación muchos a muchos entre Estudiante y Curso',
  'Agrega el atributo telefono: String a la clase Cliente',
];

/** Hash simple y determinístico para asignar colores a los colaboradores */
function colorForUser(userId: string): string {
  if (userId === 'ai-assistant') return 'hsl(265, 80%, 55%)';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 45%)`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Soporte de voz opcional (Web Speech API) */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface FormattedChatMessageProps {
  content: string;
  isAi: boolean;
  isOwn: boolean;
}

function renderInlineFormatting(text: string, isAi: boolean, isOwn: boolean) {
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldText = part.slice(2, -2);
      return (
        <strong
          key={index}
          className={`font-semibold ${
            isOwn ? 'text-white' : isAi ? 'text-purple-200' : 'text-ink'
          }`}
        >
          {boldText}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeText = part.slice(1, -1);
      return (
        <code
          key={index}
          className={`rounded px-1 py-0.5 font-mono text-[11px] ${
            isOwn
              ? 'bg-white/20 text-white'
              : isAi
              ? 'border border-purple-500/25 bg-purple-900/40 text-purple-300'
              : 'border border-hairline bg-raised text-ink-soft'
          }`}
        >
          {codeText}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function FormattedChatMessage({ content, isAi, isOwn }: FormattedChatMessageProps) {
  if (!isAi) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Detectar tablas Markdown (| Columna 1 | Columna 2 |) en caso de existir en el historial
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        tableLines.push(lines[i].trim());
        i++;
      }

      const parsedRows = tableLines
        .filter((tl) => !/^\|(\s*:?-+:?\s*\|)+$/.test(tl)) // Ignorar línea divisoria |---|---|
        .map((tl) =>
          tl
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

      if (parsedRows.length > 0) {
        const headers = parsedRows[0];
        const rows = parsedRows.slice(1);

        elements.push(
          <div
            key={`table-${i}`}
            className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-purple-500/30 bg-purple-950/40 p-0.5 shadow-xs"
          >
            <table className="w-full min-w-[260px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-purple-500/30 bg-purple-900/35">
                  {headers.map((h, colIdx) => (
                    <th
                      key={colIdx}
                      className="px-2.5 py-1.5 font-bold text-purple-200 whitespace-nowrap"
                    >
                      {renderInlineFormatting(h, isAi, isOwn)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="border-b border-purple-500/15 last:border-none hover:bg-purple-900/20"
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="px-2.5 py-1.5 text-ink-soft align-top"
                      >
                        {renderInlineFormatting(cell, isAi, isOwn)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // 2. Líneas vacías
    if (!trimmed) {
      elements.push(<div key={`empty-${i}`} className="h-1.5" />);
      i++;
      continue;
    }

    // 3. Encabezados Markdown (#, ##, ###)
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headerMatch) {
      elements.push(
        <h4
          key={`h-${i}`}
          className="mt-2.5 mb-1 font-bold text-purple-300 text-[12.5px] tracking-tight"
        >
          {renderInlineFormatting(headerMatch[2], isAi, isOwn)}
        </h4>
      );
      i++;
      continue;
    }

    // 4. Listas y viñetas (con soporte para sub-niveles e indentación)
    const bulletMatch = rawLine.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      const indentLength = bulletMatch[1].length;
      const isSubLevel = indentLength >= 2;
      const text = bulletMatch[3];

      elements.push(
        <div
          key={`bullet-${i}`}
          className={`flex items-start gap-1.5 my-1 leading-relaxed ${
            isSubLevel
              ? 'ml-3.5 border-l border-purple-500/25 pl-2 text-[12px]'
              : 'text-[12.5px]'
          }`}
        >
          <span
            className={`shrink-0 select-none ${
              isSubLevel
                ? 'mt-1.5 text-[9px] text-purple-400/70'
                : 'mt-1 text-[11px] text-purple-400 font-bold'
            }`}
          >
            {isSubLevel ? '○' : '•'}
          </span>
          <div className="min-w-0 flex-1 break-words">
            {renderInlineFormatting(text, isAi, isOwn)}
          </div>
        </div>
      );
      i++;
      continue;
    }

    // 5. Párrafo normal
    elements.push(
      <p key={`p-${i}`} className="my-0.5 break-words leading-relaxed text-[12.5px]">
        {renderInlineFormatting(trimmed, isAi, isOwn)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5 text-left">{elements}</div>;
}

export function AiWorkspacePanel({
  messages,
  currentUserId,
  currentUserName,
  connected,
  isProcessing,
  onSendMessage,
  onClose,
}: AiWorkspacePanelProps) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll hacia el último mensaje
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isProcessing]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
    };
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;
    onSendMessage(trimmed);
    setInput('');
  }

  function handleQuickPrompt(promptText: string) {
    if (isProcessing) return;
    onSendMessage(promptText);
  }

  const AUDIT_PROMPT =
    'Por favor, audita el diagrama de clases UML actual: analiza si existen clases sin atributos o métodos esenciales, relaciones huérfanas, errores de cardinalidad o inconsistencias teóricas de modelado UML, y propón las correcciones o mejoras pertinentes. Estructura tu respuesta usando listas con viñetas y negritas jerárquicas (no utilices tablas markdown).';

  const SUMMARY_PROMPT =
    'Por favor, genera un resumen ejecutivo y claro de los avances del equipo en este proyecto: qué clases y relaciones se han creado o modificado recientemente y cuáles son las tareas o aspectos pendientes del modelado. Estructura tu respuesta usando listas con viñetas y negritas jerárquicas (no utilices tablas markdown).';

  function handleAudit() {
    if (isProcessing) return;
    onSendMessage(AUDIT_PROMPT);
  }

  function handleSummary() {
    if (isProcessing) return;
    onSendMessage(SUMMARY_PROMPT);
  }

  function toggleVoice() {
    console.log('🎤 [IA Mic] Botón presionado. Estado listening:', listening);
    setVoiceError(null);

    if (listening) {
      console.log('⏹️ [IA Mic] Deteniendo reconocimiento manual por nuevo clic');
      try {
        recognitionRef.current?.abort();
      } catch (_) {}
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      console.error('❌ [IA Mic] Web Speech API no soportada');
      setVoiceError(
        'Tu navegador no soporta Web Speech API. Se recomienda usar Google Chrome o Microsoft Edge.'
      );
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }

      const recognition = new Ctor();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        console.log('🎤 [IA Mic] Micrófono iniciado - esperando voz...');
        setListening(true);
        setVoiceError(null);
      };

      recognition.onresult = (event: any) => {
        console.log('✅ [IA Mic] onresult recibido:', event);
        const transcript =
          event?.results?.[event.resultIndex]?.[0]?.transcript ||
          event?.results?.[0]?.[0]?.transcript ||
          '';
        console.log('✅ [IA Mic] Texto transcrito:', transcript);
        if (transcript.trim()) {
          const cleanText = transcript.trim();
          setInput((prev) => (prev ? `${prev} ${cleanText}` : cleanText));
        }
      };

      recognition.onerror = (event: any) => {
        const err = event?.error || 'desconocido';
        console.warn('❌ [IA Mic] Error:', err);
        setListening(false);
        if (err === 'no-speech') {
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setVoiceError(
            'Permiso de micrófono bloqueado. Haz clic en el ícono junto a la URL y selecciona Permitir acceso al micrófono.'
          );
        } else if (err === 'audio-capture') {
          setVoiceError('No se detectó ningún micrófono activo en tu equipo.');
        } else if (err === 'network') {
          setVoiceError('Error de red al procesar la voz con el servicio de reconocimiento.');
        } else if (err !== 'aborted') {
          setVoiceError(`Error del micrófono: ${err}`);
        }
      };

      recognition.onend = () => {
        console.log('⏹️ [IA Mic] Micrófono finalizado');
        recognitionRef.current = null;
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      console.error('❌ [IA Mic] Error al iniciar SpeechRecognition:', err);
      recognitionRef.current = null;
      setListening(false);
      setVoiceError(
        'No se pudo activar el reconocimiento de voz. Verifica los permisos de tu navegador.'
      );
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-hairline-strong bg-surface select-text shadow-xl">
      {/* Cabecera del Panel Lateral en Modo IA */}
      <div className="flex items-center justify-between border-b border-hairline-strong bg-raised/70 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-md shadow-accent/30">
            <Sparkles size={17} className="animate-pulse text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-ink tracking-tight">
                IA Colaborativa
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En vivo
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">
              Asistente UML • Tool Calling en Vivo
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Volver a Modo Manual"
          className="flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-overlay hover:text-ink"
        >
          <ChevronLeft size={14} />
          <span>Manual</span>
        </button>
      </div>

      {/* Historial de Mensajes Colaborativos y Respuestas de IA */}
      <div ref={listRef} className="flex-1 space-y-3.5 overflow-y-auto p-4 text-[13px]">
        {messages.length === 0 && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-hi">
              <Wand2 size={22} />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-ink">¡Bienvenido al Modo IA!</p>
              <p className="text-[12px] text-ink-muted px-4">
                Escribe instrucciones en lenguaje natural. La IA entenderá las
                peticiones de todos los colaboradores y modificará el diagrama en tiempo real.
              </p>
            </div>

            <div className="pt-2 text-left space-y-2.5">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider px-1">
                Comandos rápidos del equipo:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleAudit}
                  disabled={isProcessing}
                  className="flex flex-col items-start gap-1 rounded-xl border border-purple-500/35 bg-purple-500/10 p-2.5 text-left transition-all hover:border-purple-400 hover:bg-purple-500/20 disabled:opacity-50 shadow-sm"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-300">
                    <ShieldAlert size={14} className="text-purple-500" />
                    <span>Auditar Diagrama</span>
                  </div>
                  <span className="text-[10px] text-ink-muted leading-tight">
                    Detecta clases vacías o inconsistencias UML
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSummary}
                  disabled={isProcessing}
                  className="flex flex-col items-start gap-1 rounded-xl border border-sky-500/35 bg-sky-500/10 p-2.5 text-left transition-all hover:border-sky-400 hover:bg-sky-500/20 disabled:opacity-50 shadow-sm"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-300">
                    <FileText size={14} className="text-sky-500" />
                    <span>Resumen de Avances</span>
                  </div>
                  <span className="text-[10px] text-ink-muted leading-tight">
                    Síntesis ejecutiva para los integrantes
                  </span>
                </button>
              </div>

              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider px-1 pt-1">
                Modelado en lenguaje natural:
              </p>
              <div className="space-y-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleQuickPrompt(prompt)}
                    disabled={isProcessing}
                    className="w-full text-left rounded-lg border border-hairline bg-raised/80 px-3 py-2 text-[12px] text-ink-soft transition-all hover:border-accent hover:bg-accent-soft hover:text-accent-hi disabled:opacity-50"
                  >
                    💬 {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isAi =
            msg.user?.id === 'ai-assistant' ||
            msg.user?.id?.startsWith('ai-') ||
            msg.user?.name === 'Asistente UML' ||
            msg.user?.name === 'IA Colaborativa' ||
            msg.user?.name?.startsWith('Asistente') ||
            Boolean(msg.user?.name?.toLowerCase().includes('claude'));
          const isOwn = !isAi && Boolean(currentUserId && msg.user?.id === currentUserId);

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${
                isOwn ? 'items-end' : 'items-start'
              }`}
            >
              {/* Etiqueta del emisor con distinción visual */}
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium">
                {isAi ? (
                  <span className="flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-purple-400 font-semibold shadow-xs">
                    <Bot size={12} className="text-purple-400" />
                    [Asistente UML]
                  </span>
                ) : isOwn ? (
                  <span className="text-accent-hi flex items-center gap-1 font-semibold">
                    <User size={11} />
                    [{msg.user?.name || currentUserName || 'Tú'}]
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 font-semibold"
                    style={{ color: colorForUser(msg.user?.id || 'anon') }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: colorForUser(msg.user?.id || 'anon') }}
                    />
                    [{msg.user?.name || 'Colaborador'}]
                  </span>
                )}
                <span className="text-[10px] text-ink-faint">
                  {formatTime(msg.createdAt)}
                </span>
              </div>

              {/* Burbuja del mensaje */}
              <div
                className={`rounded-xl px-3.5 py-2.5 max-w-[90%] shadow-sm ${
                  isAi
                    ? 'border border-purple-500/30 bg-purple-500/10 text-ink leading-relaxed ring-1 ring-purple-500/15'
                    : isOwn
                    ? 'bg-accent text-white rounded-br-none shadow-md shadow-accent/20'
                    : 'bg-raised border border-hairline text-ink-soft rounded-bl-none'
                }`}
              >
                <FormattedChatMessage content={msg.content} isAi={isAi} isOwn={isOwn} />

                {/* Acciones de Tool Calling ejecutadas por la IA */}
                {isAi && msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 border-t border-purple-500/20 pt-2">
                    <p className="text-[10px] font-semibold tracking-wider text-purple-600 dark:text-purple-300 uppercase">
                      Cambios aplicados al lienzo:
                    </p>
                    <div className="space-y-1">
                      {msg.actions.map((action, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 rounded-md bg-purple-500/15 px-2 py-1 text-[11px] text-purple-700 dark:text-purple-200"
                        >
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Indicador visual cuando la IA está procesando peticiones o ejecutando Tool Calling */}
        {isProcessing && (
          <div className="animate-fade-rise flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent-soft/70 p-3 shadow-md">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-white">
              <Loader2 size={15} className="animate-spin" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-accent-hi">
                  Asistente UML procesando petición…
                </span>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
              </div>
              <p className="text-[11px] text-ink-muted">
                Ejecutando herramientas UML (Tool Calling) y sincronizando el lienzo en tiempo real.
              </p>
              <div className="flex items-center gap-1.5 pt-1 text-[10px] text-accent-hi/80 font-mono">
                <Cpu size={12} />
                <span>create_class • create_relationship • update_canvas</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra de Entrada de Comandos */}
      <div className="border-t border-hairline-strong bg-raised/40 p-3">
        {!connected && (
          <div className="mb-2 text-center text-[11px] text-amber-400">
            Reconectando Socket.IO con el servidor…
          </div>
        )}

        {/* Comandos rápidos especializados: Auditar y Resumen de Avances */}
        <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={handleAudit}
            disabled={isProcessing}
            title="Auditar el diagrama en busca de inconsistencias o relaciones huérfanas"
            className="flex items-center gap-1.5 shrink-0 rounded-lg border border-purple-500/35 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-300 transition-all hover:bg-purple-500/20 hover:border-purple-500/60 hover:text-purple-100 disabled:opacity-40 shadow-xs"
          >
            <ShieldAlert size={13} className="text-purple-400" />
            <span>Auditar Diagrama</span>
          </button>

          <button
            type="button"
            onClick={handleSummary}
            disabled={isProcessing}
            title="Generar un resumen ejecutivo de los avances del equipo en la sala"
            className="flex items-center gap-1.5 shrink-0 rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 transition-all hover:bg-sky-500/20 hover:border-sky-500/60 hover:text-sky-100 disabled:opacity-40 shadow-xs"
          >
            <FileText size={13} className="text-sky-400" />
            <span>Resumen de Avances</span>
          </button>
        </div>

        {voiceError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-amber-400" />
              <span>{voiceError}</span>
            </div>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="text-amber-400 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={isProcessing}
              title={listening ? 'Detener dictado' : 'Hablar comando'}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-all ${
                listening
                  ? 'animate-pulse border-critical bg-critical-soft text-critical shadow-sm'
                  : 'border-hairline-strong bg-sunken text-ink-soft hover:bg-overlay hover:text-ink'
              } disabled:opacity-50`}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={
              listening
                ? 'Escuchando tu voz…'
                : 'Ej: Crea la clase Producto con id y precio…'
            }
            className="w-full min-w-0 rounded-lg border border-hairline-strong bg-sunken px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-white transition-all hover:bg-accent-hi disabled:opacity-50 shadow-md shadow-accent/25"
            aria-label="Enviar instrucción"
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </form>
      </div>
    </aside>
  );
}

