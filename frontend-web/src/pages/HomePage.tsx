import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Compass,
  FolderPlus,
  Link2,
  LogIn,
  Trash2,
  Users,
} from 'lucide-react';
import axios from 'axios';
import { clearSession, getStoredUser } from '../services/auth';
import { copyToClipboard } from '../services/clipboard';
import {
  createProject,
  deleteProject,
  getInviteInfo,
  joinProject,
  listProjects,
} from '../services/projects';
import type { Project } from '../services/projects';
import { getErrorMessage } from '../services/http-error';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { OnboardingTour } from '../components/OnboardingTour';
import { HelpGuideAssistant } from '../components/HelpGuideAssistant';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';

const FIELD_CLASS =
  'w-full rounded-lg border border-hairline-strong bg-sunken px-3 py-2.5 text-sm text-ink ' +
  'outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent-soft';

/** RF3 - Panel de control: listar, crear y eliminar proyectos del usuario. */
export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = getStoredUser();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // RF4/RF10: unirse a un proyecto ajeno con (código, contraseña).
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // RF4: feedback al copiar el enlace + código de invitación de un proyecto.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);

  // Modal de Asistente Guía & Centro de Ayuda
  const [guideOpen, setGuideOpen] = useState(false);

  // Tutorial guiado para usuarios nuevos: se abre solo una vez (ver
  // lib/onboarding.ts) y se puede volver a ver desde el botón de ayuda del
  // Navbar. Se calcula como valor inicial del estado -- no en un efecto de
  // montaje -- ya que solo depende de localStorage al momento de montar.
  const [tourOpen, setTourOpen] = useState(() => !hasSeenOnboarding());
  function closeTour() {
    markOnboardingSeen();
    setTourOpen(false);
  }

  // Si el token caducó o es inválido, cerramos sesión y volvemos al login.
  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        clearSession();
        navigate('/login');
        return true;
      }
      return false;
    },
    [navigate],
  );

  // Carga inline en el efecto (en vez de una función con nombre en las
  // deps): loading/error ya empiezan correctos por el estado inicial, y así
  // el analizador ve el setState solo dentro de los callbacks async, no
  // como algo que el efecto dispare síncronamente al entrar.
  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!handleAuthError(err)) {
          setError(getErrorMessage(err, 'No se pudieron cargar los proyectos'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleAuthError]);

  // RF4: si llegan por un enlace de invitación (?join=CODIGO), abre el
  // formulario de unirse con el código ya rellenado. Abrir el modal se
  // ajusta durante el render (comparando con el código ya procesado) para
  // no disparar un setState síncrono en un efecto; solo limpiar el query
  // param de la URL -- un sistema externo -- queda en el efecto.
  const joinParam = searchParams.get('join');
  const [handledJoinParam, setHandledJoinParam] = useState<string | null>(null);
  if (joinParam && joinParam !== handledJoinParam) {
    setHandledJoinParam(joinParam);
    setJoinCode(joinParam.toUpperCase());
    setJoinPassword('');
    setJoinError(null);
    setJoinModalOpen(true);
  }

  useEffect(() => {
    if (!joinParam) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('join');
      return next;
    });
  }, [joinParam, setSearchParams]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  function openModal() {
    setName('');
    setDescription('');
    setError(null);
    setModalOpen(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setProjects((prev) => [created, ...prev]);
      setModalOpen(false);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(getErrorMessage(err, 'No se pudo crear el proyecto'));
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(getErrorMessage(err, 'No se pudo eliminar el proyecto'));
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  function openJoinModal() {
    setJoinCode('');
    setJoinPassword('');
    setJoinError(null);
    setJoinModalOpen(true);
  }

  // RF4/RF10: valida (código, contraseña) contra el backend y entra al editor.
  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || !joinPassword.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinProject({
        code: joinCode.trim(),
        password: joinPassword.trim(),
      });
      setJoinModalOpen(false);
      navigate(`/projects/${result.id}/editor`);
    } catch (err) {
      if (!handleAuthError(err)) {
        setJoinError(getErrorMessage(err, 'Código o contraseña incorrectos'));
      }
    } finally {
      setJoining(false);
    }
  }

  // RF4: copia al portapapeles el enlace + código + contraseña de invitación
  // (solo el dueño puede consultar las credenciales del proyecto).
  async function handleCopyInvite(project: Project) {
    setInviteBusyId(project.id);
    setError(null);
    try {
      const { inviteCode, invitePassword } = await getInviteInfo(project.id);
      const link = `${window.location.origin}/?join=${inviteCode}`;
      const text = [
        `Únete a "${project.name}" en la plataforma:`,
        link,
        `Código: ${inviteCode}`,
        `Contraseña: ${invitePassword}`,
      ].join('\n');
      await copyToClipboard(text);
      setCopiedId(project.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(getErrorMessage(err, 'No se pudo obtener la invitación'));
      }
    } finally {
      setInviteBusyId(null);
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const firstName = user.name.split(' ')[0];

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onReplayTour={() => setTourOpen(true)}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {/* Cabecera de la vista */}
      <div className="bg-halo relative border-b border-hairline">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
        <main
          data-tour="workspace-header"
          className="relative mx-auto max-w-6xl px-5 pt-9 pb-7"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium tracking-wide text-ink-muted uppercase">
                Espacio de trabajo
              </p>
              <h1 className="mt-1.5 text-[22px] font-semibold text-ink">
                Hola, {firstName}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {projects.length === 0
                  ? 'Aún no tienes proyectos. Crea tu primer diagrama de clases.'
                  : `${projects.length} ${
                      projects.length === 1 ? 'proyecto' : 'proyectos'
                    } en tu espacio de trabajo.`}
              </p>
            </div>
            <div data-tour="quick-actions" className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={openJoinModal}
                icon={<LogIn size={16} />}
              >
                Unirme a cooperativo
              </Button>
              <Button onClick={openModal} icon={<FolderPlus size={16} />}>
                Nuevo proyecto
              </Button>
            </div>
          </div>
        </main>
      </div>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {error && !modalOpen && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[168px] animate-pulse rounded-xl border border-hairline bg-surface"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline-strong bg-surface px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-hairline-strong bg-raised text-accent-hi">
              <FolderPlus size={24} />
            </span>
            <h2 className="mt-4 text-[15px] font-medium text-ink">
              Todavía no tienes proyectos
            </h2>
            <p className="mt-1.5 max-w-sm text-[13px] text-ink-muted">
              Crea un proyecto para modelar tus clases, derivar el modelo de
              base de datos y generar el backend Spring Boot.
            </p>
            <Button
              onClick={openModal}
              icon={<FolderPlus size={16} />}
              className="mt-5"
            >
              Nuevo proyecto
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => {
              const isOwner = project.role !== 'COLLABORATOR';
              return (
                <article
                  key={project.id}
                  data-tour={index === 0 ? 'project-card' : undefined}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-surface p-6 shadow-md transition-all duration-300 hover:border-sky-500/50 hover:shadow-[0_0_30px_rgba(56,189,248,0.18)] hover:-translate-y-1"
                >
                  <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[16px] font-bold text-ink tracking-tight">
                          {project.name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isOwner
                              ? 'border border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-400 shadow-sm'
                              : 'border border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400 shadow-sm'
                          }`}
                        >
                          <Users size={10} />
                          {isOwner ? 'Dueño' : 'Colaborador'}
                        </span>
                      </div>
                    </div>
                    <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-0.5">
                      {isOwner && (
                        <button
                          type="button"
                          data-tour={index === 0 ? 'project-invite-action' : undefined}
                          onClick={() => handleCopyInvite(project)}
                          disabled={inviteBusyId === project.id}
                          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
                          title="Copiar enlace de invitación y código"
                        >
                          {copiedId === project.id ? (
                            <Check size={16} className="text-emerald-500" />
                          ) : (
                            <Link2 size={16} />
                          )}
                        </button>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          disabled={deletingId === project.id}
                          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-critical-soft hover:text-critical disabled:opacity-50"
                          title="Eliminar proyecto"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-[13px] text-ink-soft">
                    {project.description || 'Sin descripción.'}
                  </p>

                  <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-muted font-mono">
                    <Clock size={13} className="text-accent" />
                    Actualizado {formatDate(project.updatedAt)}
                  </div>

                  <button
                    type="button"
                    data-tour={index === 0 ? 'editor-open-action' : undefined}
                    onClick={() => navigate(`/projects/${project.id}/editor`)}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_0_18px_rgba(56,189,248,0.22)] transition-all group-hover:from-sky-500 group-hover:to-blue-500 group-hover:shadow-[0_0_24px_rgba(56,189,248,0.4)]"
                  >
                    Abrir en el editor en vivo
                    <ArrowRight size={15} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        title="Nuevo proyecto"
        description="Nombra tu proyecto para empezar a modelar."
        onClose={() => !creating && setModalOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="project-name"
              className="block text-[12px] font-medium text-ink-soft"
            >
              Nombre del proyecto
            </label>
            <input
              id="project-name"
              type="text"
              autoFocus
              placeholder="p. ej. Sistema de ventas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={FIELD_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="project-desc"
              className="block text-[12px] font-medium text-ink-soft"
            >
              Descripción <span className="text-ink-faint">(opcional)</span>
            </label>
            <textarea
              id="project-desc"
              rows={3}
              placeholder="Breve descripción del proyecto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${FIELD_CLASS} resize-none`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={creating}
              disabled={!name.trim()}
              icon={!creating && <FolderPlus size={16} />}
            >
              {creating ? 'Creando…' : 'Crear proyecto'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* RF4/RF10: unirme a cooperativo con código + contraseña */}
      <Modal
        open={joinModalOpen}
        title="Unirme a cooperativo"
        description="Ingresa el código de invitación y la contraseña que te compartió el dueño del proyecto."
        onClose={() => !joining && setJoinModalOpen(false)}
      >
        <form onSubmit={handleJoin} className="space-y-4">
          {joinError && (
            <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{joinError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="join-code"
              className="block text-[12px] font-medium text-ink-soft"
            >
              Código del proyecto
            </label>
            <input
              id="join-code"
              type="text"
              autoFocus
              placeholder="p. ej. AB12CD34"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              required
              className={`${FIELD_CLASS} uppercase tracking-wider`}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="join-password"
              className="block text-[12px] font-medium text-ink-soft"
            >
              Contraseña
            </label>
            <input
              id="join-password"
              type="text"
              inputMode="numeric"
              placeholder="6 dígitos"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              required
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setJoinModalOpen(false)}
              disabled={joining}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={joining}
              disabled={!joinCode.trim() || !joinPassword.trim()}
              icon={!joining && <LogIn size={16} />}
            >
              {joining ? 'Uniéndome…' : 'Unirme'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Botón flotante para el Asistente Guía & Centro de Ayuda */}
      <button
        type="button"
        data-tour="guide-assistant-btn"
        onClick={() => setGuideOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full border border-sky-400/40 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-[0_8px_25px_rgba(56,189,248,0.35)] transition-all hover:scale-105 hover:shadow-[0_12px_32px_rgba(56,189,248,0.5)] cursor-pointer"
        title="Abrir Asistente Guía & Centro de Ayuda"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20">
          <Compass size={14} className="text-white animate-spin-slow" />
        </span>
        <span className="tracking-tight hidden sm:inline">Asistente Guía & Ayuda</span>
        <span className="tracking-tight sm:hidden">Guía</span>
      </button>

      <HelpGuideAssistant
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onStartTour={() => {
          setGuideOpen(false);
          setTourOpen(true);
        }}
      />

      <OnboardingTour
        open={tourOpen}
        onClose={closeTour}
        onFinish={closeTour}
      />
    </div>
  );
}
