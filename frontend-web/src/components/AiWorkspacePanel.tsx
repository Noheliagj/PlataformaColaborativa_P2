import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bot,
  Check,
  ChevronLeft,
  Cpu,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import type { ProjectChatMessage } from '../services/projects';

interface AiWorkspacePanelProps {
  projectId: string;
  messages: ProjectChatMessage[];
  currentUserId: string | null;
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
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AiWorkspacePanel({
  messages,
  currentUserId,
  connected,
  isProcessing,
  onSendMessage,
  onClose,
}: AiWorkspacePanelProps) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
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
      recognitionRef.current?.stop();
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

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'es-419';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;
        if (result.isFinal) isFinal = true;
      }
      setInput(transcript);
      if (isFinal && transcript.trim()) {
        onSendMessage(transcript.trim());
        setInput('');
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
                Modo IA Colaborativo
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En vivo
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">
              Claude Sonnet • Tool Calling UML
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

            <div className="pt-2 text-left space-y-1.5">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider px-1">
                Sugerencias rápidas:
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
            msg.user?.name?.toLowerCase().includes('ia') ||
            msg.user?.name?.toLowerCase().includes('claude');
          const isOwn = msg.user?.id === currentUserId && !isAi;

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
                    [IA - Claude]
                  </span>
                ) : isOwn ? (
                  <span className="text-ink-muted flex items-center gap-1">
                    <User size={11} />
                    [Tú]
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
                    ? 'border border-purple-500/25 bg-purple-950/20 text-ink leading-relaxed ring-1 ring-purple-500/10'
                    : isOwn
                    ? 'bg-accent text-white rounded-br-none shadow-md shadow-accent/20'
                    : 'bg-raised border border-hairline text-ink-soft rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                {/* Acciones de Tool Calling ejecutadas por la IA */}
                {isAi && msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 border-t border-purple-500/20 pt-2">
                    <p className="text-[10px] font-semibold tracking-wider text-purple-300 uppercase">
                      Cambios aplicados al lienzo:
                    </p>
                    <div className="space-y-1">
                      {msg.actions.map((action, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 rounded-md bg-purple-500/10 px-2 py-1 text-[11px] text-purple-200"
                        >
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
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
                  Claude procesando petición…
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

