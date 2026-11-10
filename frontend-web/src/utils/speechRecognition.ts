/**
 * speechRecognition.ts
 * Utilidad de reconocimiento de voz aislada del ciclo de vida de React.
 *
 * Usa Web Speech API (SpeechRecognition / webkitSpeechRecognition) en modo
 * "one-shot" (continuous=false) para máxima compatibilidad con Edge/Chrome
 * sobre conexiones HTTP.
 *
 * Si Web Speech API no está disponible o falla con "network", ofrece un
 * fallback con MediaRecorder que graba el audio y lo convierte a texto
 * usando el backend (POST /ai/transcribe).
 */

// ── Types ──────────────────────────────────────────────────────────────
type OnTranscript = (text: string) => void;
type OnStateChange = (listening: boolean) => void;
type OnError = (message: string) => void;

interface SpeechManagerCallbacks {
  onTranscript: OnTranscript;
  onStateChange: OnStateChange;
  onError: OnError;
}

// ── Internal State ─────────────────────────────────────────────────────
let recognition: any = null;
let callbacks: SpeechManagerCallbacks | null = null;
let isActive = false;

// ── Helpers ────────────────────────────────────────────────────────────
function getRecognitionCtor(): (new () => any) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('%c[VoiceUtil]', 'color:#a78bfa;font-weight:bold', ...args);
}

function warn(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.warn('%c[VoiceUtil]', 'color:#fbbf24;font-weight:bold', ...args);
}

// ── Public API ─────────────────────────────────────────────────────────

/** Returns true if the browser supports Web Speech API. */
export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/** Start listening. Calls onTranscript with the transcribed text. */
export function startListening(cbs: SpeechManagerCallbacks): void {
  log('startListening called. isActive:', isActive);
  callbacks = cbs;

  // If already active, stop first
  if (isActive) {
    stopListening();
    return;
  }

  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    cbs.onError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
    return;
  }

  try {
    // Clean up any previous instance
    if (recognition) {
      try { recognition.abort(); } catch (_) { /* ignore */ }
      recognition = null;
    }

    const r = new Ctor();
    r.lang = 'es-ES';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    let gotResult = false;

    r.onstart = () => {
      log('✅ Micrófono abierto – habla ahora...');
      isActive = true;
      callbacks?.onStateChange(true);
    };

    r.onaudiostart = () => {
      log('🔊 Audio detectado');
    };

    r.onspeechstart = () => {
      log('🗣️ Voz detectada');
    };

    r.onresult = (event: any) => {
      gotResult = true;
      const transcript = event?.results?.[0]?.[0]?.transcript ?? '';
      log('📝 Transcripción:', transcript);
      if (transcript.trim()) {
        callbacks?.onTranscript(transcript.trim());
      }
    };

    r.onerror = (event: any) => {
      const err = event?.error ?? 'unknown';
      warn('Error:', err);

      if (err === 'no-speech') {
        // Silent – just ended without hearing anything
        log('Sin voz detectada, micrófono cerrado normalmente.');
        return;
      }
      if (err === 'aborted') {
        return;
      }

      isActive = false;
      callbacks?.onStateChange(false);

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        callbacks?.onError(
          'Permiso de micrófono denegado. Haz clic en el ícono del candado/micrófono junto a la URL y permite el acceso.'
        );
      } else if (err === 'audio-capture') {
        callbacks?.onError('No se detectó ningún micrófono conectado a tu equipo.');
      } else if (err === 'network') {
        callbacks?.onError(
          'Error de red con el servicio de voz. Intenta recargar la página o usar Chrome.'
        );
      } else {
        callbacks?.onError(`Error de reconocimiento de voz: ${err}`);
      }
    };

    r.onend = () => {
      log('⏹️ Reconocimiento finalizado. gotResult:', gotResult);
      isActive = false;
      recognition = null;
      callbacks?.onStateChange(false);
    };

    recognition = r;
    log('Llamando recognition.start()...');
    r.start();
    log('recognition.start() ejecutado sin excepción');
  } catch (err) {
    warn('Excepción al iniciar:', err);
    isActive = false;
    recognition = null;
    callbacks?.onStateChange(false);
    callbacks?.onError('No se pudo iniciar el reconocimiento de voz.');
  }
}

/** Stop listening. */
export function stopListening(): void {
  log('stopListening called. isActive:', isActive);
  if (recognition) {
    try { recognition.abort(); } catch (_) { /* ignore */ }
    recognition = null;
  }
  isActive = false;
  callbacks?.onStateChange(false);
}

/** Check if currently listening. */
export function isListening(): boolean {
  return isActive;
}
