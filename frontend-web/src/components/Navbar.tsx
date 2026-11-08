import { Compass, HelpCircle, LogOut } from 'lucide-react';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { ThemeToggle } from './ui/ThemeToggle';
import { useTheme } from '../lib/useTheme';
import type { AuthUser } from '../services/auth';

interface NavbarProps {
  user: AuthUser;
  onLogout: () => void;
  onReplayTour?: () => void;
  onOpenGuide?: () => void;
}

/** Barra superior del dashboard: marca, identidad del usuario y salida. */
export function Navbar({ user, onLogout, onReplayTour, onOpenGuide }: NavbarProps) {
  const [theme, toggleTheme] = useTheme();
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-xl shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Brand showTagline={false} />

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2.5 rounded-xl border border-hairline bg-raised py-1.5 pr-3.5 pl-2 sm:flex shadow-sm">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-sky-500/50 bg-gradient-to-br from-blue-600 to-indigo-600 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(56,189,248,0.3)]">
              {initials || 'U'}
            </span>
            <span className="leading-tight">
              <span className="block text-[12px] font-bold text-ink">
                {user.name}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {user.email}
              </span>
            </span>
          </div>

          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[12px] font-bold text-sky-600 dark:text-sky-300 transition-all hover:bg-sky-500/20 hover:border-sky-500/50 shadow-sm cursor-pointer"
              title="Centro de Ayuda & Asistente Guía"
            >
              <Compass size={15} className="text-sky-500" />
              <span className="hidden md:inline">Centro de Ayuda</span>
            </button>
          )}

          {onReplayTour && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReplayTour}
              icon={<HelpCircle size={16} />}
              aria-label="Ver tutorial interactivo"
              title="Ver tutorial interactivo"
            />
          )}

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <Button
            variant="secondary"
            size="sm"
            onClick={onLogout}
            icon={<LogOut size={14} />}
          >
            <span className="hidden sm:inline">Cerrar sesión</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
