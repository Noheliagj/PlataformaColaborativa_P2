import { ArrowLeft, History, Loader2, Save, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import type { ProjectRole } from '../services/projects';
import type { PresenceUser } from '../services/socket';
import { Button } from './ui/Button';

export interface StatusMeta {
  dot: string;
  label: string;
  spin: boolean;
}

interface EditorHeaderProps {
  projectName: string;
  role: ProjectRole | null;
  statusMeta: StatusMeta;
  remoteEditor: string | null;
  presence: PresenceUser[];
  saving: boolean;
  aiMode: boolean;
  onToggleAiMode: () => void;
  onBack: () => void;
  onSave: () => void;
  onOpenHistory: () => void;
}

/** Hash simple y determinístico: mismo usuario -> mismo color de avatar. */
function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 45%)`;
}

function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

const MAX_VISIBLE_AVATARS = 4;

/** RF10: avatares/iniciales de quién tiene el proyecto abierto ahora mismo. */
function PresenceAvatars({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;

  const visible = users.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = users.length - visible.length;

  return (
    <div
      className="flex items-center -space-x-2"
      title={users.map((u) => u.userName).join(', ')}
    >
      {visible.map((user) => (
        <span
          key={user.userId}
          className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface text-[10px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: colorForUser(user.userId) }}
          title={user.userName}
        >
          {initialsFor(user.userName)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-raised text-[10px] font-semibold text-ink-soft">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * RF9/RF10 - Barra superior del editor: solo lo esencial (volver, presencia,
 * historial, guardar). El resto de acciones (modelado, XMI, Vision, asistente
 * de IA, tema) vive en EditorToolsPanel para no saturar esta barra.
 */
export function EditorHeader({
  projectName,
  role,
  statusMeta,
  remoteEditor,
  presence,
  saving,
  aiMode,
  onToggleAiMode,
  onBack,
  onSave,
  onOpenHistory,
}: EditorHeaderProps) {
  return (
    <header className="z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0f172a]/90 px-4 py-2.5 backdrop-blur-xl shadow-md">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 transition-all hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={14} /> Proyectos
        </button>

        <span className="h-5 w-px bg-white/10" />

        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[14px] font-bold text-white tracking-tight">
            {projectName || 'Editor UML'}
          </h1>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-[#131b2e] px-2.5 py-0.5 text-[11px] text-slate-300 sm:inline-flex shadow-sm">
            {statusMeta.spin ? (
              <Loader2 size={11} className="animate-spin text-sky-400" />
            ) : (
              <span className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${statusMeta.dot}`} />
            )}
            {statusMeta.label}
          </span>
          {role === 'COLLABORATOR' && (
            <span className="hidden items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-400 sm:inline-flex shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              <Users size={11} />
              Colaborador
            </span>
          )}
        </div>
      </div>

      {/* Selector destacado de Modo: Manual vs Modo IA */}
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0b0f19] p-1 shadow-inner">
        <button
          type="button"
          onClick={() => aiMode && onToggleAiMode()}
          title="Modo Manual: Edición tradicional y herramientas visuales"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
            !aiMode
              ? 'bg-raised text-ink shadow-sm ring-1 ring-hairline'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">Modo Manual</span>
        </button>

        <button
          type="button"
          onClick={() => !aiMode && onToggleAiMode()}
          title="Modo IA: Espacio de trabajo colaborativo asistido por IA"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
            aiMode
              ? 'bg-gradient-to-r from-accent to-accent-hi text-white shadow-md shadow-accent/25 ring-1 ring-accent-hi'
              : 'text-ink-muted hover:text-accent-hi'
          }`}
        >
          <Sparkles
            size={13}
            className={aiMode ? 'animate-pulse text-amber-300' : 'text-accent-hi'}
          />
          <span>Modo IA</span>
          {aiMode && (
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          )}
        </button>
      </div>

      {remoteEditor && (
        <span className="animate-fade-rise hidden items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-hi md:inline-flex">
          <Users size={12} />
          {remoteEditor} está editando…
        </span>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <PresenceAvatars users={presence} />

        <button
          type="button"
          onClick={onOpenHistory}
          title="Historial de cambios"
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-raised px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-overlay hover:text-ink"
        >
          <History size={14} />
          <span className="hidden lg:inline">Historial</span>
        </button>

        <Button
          size="sm"
          onClick={onSave}
          loading={saving}
          icon={!saving && <Save size={15} />}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </header>
  );
}
