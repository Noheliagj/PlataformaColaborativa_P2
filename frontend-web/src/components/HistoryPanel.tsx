import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Calendar,
  Clock3,
  Code2,
  FileCode,
  GitCommit,
  Image,
  Layers,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';
import { getProjectHistory } from '../services/projects';
import type { ProjectActivity } from '../services/projects';
import { getErrorMessage } from '../services/http-error';

type ActionCategory = 'ALL' | 'SAVE' | 'AI' | 'IMPORT' | 'STRUCTURE';

interface ActionMeta {
  label: string;
  category: 'SAVE' | 'AI' | 'IMPORT' | 'STRUCTURE';
  badge: string;
  badgeClass: string;
  icon: typeof Save;
  iconBg: string;
  description: string;
}

const ACTION_METAS: Record<string, ActionMeta> = {
  SAVE_DIAGRAM: {
    label: 'Guardado manual del diagrama',
    category: 'SAVE',
    badge: 'Guardado',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: Save,
    iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Actualizó y sincronizó el estado general del modelo UML en el lienzo.',
  },
  IMPORT_IMAGE: {
    label: 'Importación por Visión IA',
    category: 'IMPORT',
    badge: 'IA Visión',
    badgeClass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    icon: Image,
    iconBg: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    description: 'Reconstruyó y distribuyó espacialmente el diagrama a partir de una imagen.',
  },
  IMPORT_XMI: {
    label: 'Importación de archivo XMI 2.1',
    category: 'IMPORT',
    badge: 'XMI 2.1',
    badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    icon: FileCode,
    iconBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    description: 'Cargó especificación estándar OMG XMI con clases y relaciones.',
  },
  CREATE_ASSOCIATION_CLASS: {
    label: 'Creación de clase asociativa',
    category: 'STRUCTURE',
    badge: 'Asociación M:N',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: Layers,
    iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    description: 'Generó clase asociativa intermedia con relación orthogonal suave.',
  },
  AI_CREATE_CLASS: {
    label: 'Clase creada por Asistente IA',
    category: 'AI',
    badge: 'Tool Calling IA',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    icon: Sparkles,
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    description: 'La IA generó una nueva clase UML con atributos y métodos calculados.',
  },
  AI_ADD_ATTRIBUTE: {
    label: 'Atributo agregado por Asistente IA',
    category: 'AI',
    badge: 'Tool Calling IA',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    icon: PlusCircle,
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    description: 'Inyección de un nuevo atributo tipado en la estructura de una clase.',
  },
  AI_ADD_METHOD: {
    label: 'Método agregado por Asistente IA',
    category: 'AI',
    badge: 'Tool Calling IA',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    icon: Code2,
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    description: 'Inyección de método con firma y tipo de retorno en una clase.',
  },
  AI_CREATE_RELATIONSHIP: {
    label: 'Relación creada por Asistente IA',
    category: 'AI',
    badge: 'Tool Calling IA',
    badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    icon: GitCommit,
    iconBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    description: 'La IA estableció una relación tipada y cardinalidades entre clases.',
  },
  AI_DELETE_CLASS: {
    label: 'Elemento eliminado por Asistente IA',
    category: 'AI',
    badge: 'Tool Calling IA',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    icon: Trash2,
    iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    description: 'Eliminación asistida de una clase y sus relaciones vinculadas.',
  },
};

function getActionMeta(action: string): ActionMeta {
  if (ACTION_METAS[action]) return ACTION_METAS[action];
  return {
    label: action.replace(/_/g, ' ').toLowerCase(),
    category: 'SAVE',
    badge: 'Acción',
    badgeClass: 'bg-ink-muted/15 text-ink-muted border-hairline',
    icon: Activity,
    iconBg: 'bg-raised text-ink-muted border-hairline',
    description: 'Modificación registrada en el modelo del proyecto.',
  };
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return 'hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 30) return `hace ${diffDays} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function getUserInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getUserColor(name: string): string {
  const colors = [
    'bg-blue-600/20 text-blue-400 border-blue-500/30',
    'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    'bg-purple-600/20 text-purple-400 border-purple-500/30',
    'bg-amber-600/20 text-amber-400 border-amber-500/30',
    'bg-sky-600/20 text-sky-400 border-sky-500/30',
    'bg-pink-600/20 text-pink-400 border-pink-500/30',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface HistoryPanelProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

/**
 * RF9 - Historial y Auditoría Visual del Proyecto:
 * Muestra con alta trazabilidad quién modificó el modelo, fecha y hora exacta,
 * tipo de acción (guardado manual, importación o herramientas IA) y filtros rápidos.
 */
export function HistoryPanel({ open, projectId, onClose }: HistoryPanelProps) {
  const [entries, setEntries] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory>('ALL');

  const openKey = open ? projectId : null;
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey) {
      setLoading(true);
      setError(null);
      setSearchQuery('');
      setSelectedCategory('ALL');
    }
  }

  function fetchHistory(isManualRefresh = false) {
    if (isManualRefresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    getProjectHistory(projectId)
      .then((data) => setEntries(data))
      .catch((err) => setError(getErrorMessage(err, 'No se pudo cargar el historial de cambios')))
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
  }

  useEffect(() => {
    if (!open) return;
    fetchHistory();
  }, [open, projectId]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const meta = getActionMeta(entry.action);
      if (selectedCategory !== 'ALL' && meta.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesUser = entry.user.name.toLowerCase().includes(q);
        const matchesAction = meta.label.toLowerCase().includes(q) || entry.action.toLowerCase().includes(q);
        const matchesDate = formatFullDateTime(entry.createdAt).toLowerCase().includes(q);
        return matchesUser || matchesAction || matchesDate;
      }
      return true;
    });
  }, [entries, selectedCategory, searchQuery]);

  return (
    <Modal
      open={open}
      title="Auditoría y Trazabilidad de Cambios"
      description="Registro detallado de autores, fechas exactas y operaciones sobre el diagrama UML."
      maxWidth="max-w-2xl"
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Cabecera con buscador y botón de refrescar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por autor, acción o fecha..."
              className="w-full rounded-lg border border-hairline bg-raised/50 py-1.5 pl-8 pr-3 text-[12px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchHistory(true)}
              disabled={loading || isRefreshing}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-raised/70 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
              title="Recargar historial"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>
            <span className="flex items-center gap-1 rounded-lg border border-hairline-strong bg-raised/40 px-2 py-1 text-[11px] font-medium text-ink-soft">
              <ShieldCheck size={12} className="text-emerald-400" />
              {entries.length} {entries.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
        </div>

        {/* Filtros por Categoría */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline pb-2.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-brand text-white shadow-sm'
                : 'border border-hairline bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink'
            }`}
          >
            Todos ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('SAVE')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === 'SAVE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'border border-hairline bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink'
            }`}
          >
            Guardados Manuales
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('AI')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === 'AI'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'border border-hairline bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink'
            }`}
          >
            Asistente IA
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('IMPORT')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === 'IMPORT'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'border border-hairline bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink'
            }`}
          >
            Importaciones (XMI / Imagen)
          </button>
        </div>

        {/* Contenido principal: Loading / Error / Empty / Timeline */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
            <Spinner size={22} />
            <span className="text-[12px]">Cargando trazabilidad del proyecto...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft px-3.5 py-3 text-[13px] text-critical">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-hairline bg-raised text-ink-muted mb-2">
              <Calendar size={18} />
            </div>
            <p className="text-[13px] font-medium text-ink">No se encontraron eventos</p>
            <p className="text-[11px] text-ink-muted mt-0.5 max-w-xs">
              {searchQuery || selectedCategory !== 'ALL'
                ? 'No hay registros que coincidan con los filtros o el término de búsqueda.'
                : 'Aún no se han registrado modificaciones o guardados en este proyecto.'}
            </p>
          </div>
        ) : (
          <div className="relative max-h-[380px] overflow-y-auto pr-1">
            {/* Línea vertical de la línea de tiempo */}
            <div className="absolute left-[23px] top-3 bottom-3 w-0.5 bg-hairline" />

            <div className="space-y-3">
              {filteredEntries.map((entry) => {
                const meta = getActionMeta(entry.action);
                const IconComponent = meta.icon;
                const userColorClass = getUserColor(entry.user.name);

                return (
                  <div
                    key={entry.id}
                    className="relative flex items-start gap-3 rounded-xl border border-hairline/60 bg-raised/30 p-3 transition-colors hover:border-hairline-strong hover:bg-raised/70"
                  >
                    {/* Icono de la acción en la línea de tiempo */}
                    <div
                      className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border shadow-sm ${meta.iconBg}`}
                      title={meta.label}
                    >
                      <IconComponent size={14} />
                    </div>

                    {/* Contenido del evento */}
                    <div className="min-w-0 flex-1">
                      {/* Fila 1: Título de la acción y badge de categoría */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-[13px] font-semibold text-ink leading-tight">
                            {meta.label}
                          </h4>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.badgeClass}`}
                          >
                            {meta.badge}
                          </span>
                        </div>
                        {/* Tiempo relativo */}
                        <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted shrink-0">
                          <Clock3 size={11} />
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>

                      {/* Fila 2: Descripción contextual */}
                      <p className="mt-1 text-[11px] text-ink-muted leading-relaxed">
                        {meta.description}
                      </p>

                      {/* Fila 3: Autor y Fecha exacta completa */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-hairline/50 pt-2 text-[11px] text-ink-faint">
                        {/* Autor */}
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] font-bold ${userColorClass}`}
                          >
                            {getUserInitials(entry.user.name)}
                          </span>
                          <span className="font-medium text-ink-soft">
                            {entry.user.name}
                          </span>
                        </div>

                        <span className="text-hairline">•</span>

                        {/* Fecha exacta */}
                        <div className="flex items-center gap-1">
                          <Calendar size={11} className="shrink-0 text-ink-muted" />
                          <span title={entry.createdAt}>
                            {formatFullDateTime(entry.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
