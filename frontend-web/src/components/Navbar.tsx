import { HelpCircle, LogOut } from 'lucide-react';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { ThemeToggle } from './ui/ThemeToggle';
import { useTheme } from '../lib/useTheme';
import type { AuthUser } from '../services/auth';

interface NavbarProps {
  user: AuthUser;
  onLogout: () => void;
  onReplayTour?: () => void;
}

/** Barra superior del dashboard: marca, identidad del usuario y salida. */
export function Navbar({ user, onLogout, onReplayTour }: NavbarProps) {
  const [theme, toggleTheme] = useTheme();
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0f172a]/85 backdrop-blur-xl shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Brand showTagline={false} />

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2.5 rounded-xl border border-white/10 bg-[#131b2e] py-1.5 pr-3.5 pl-2 sm:flex shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-sky-500/50 bg-gradient-to-br from-blue-600 to-indigo-600 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(56,189,248,0.3)]">
              {initials || 'U'}
            </span>
            <span className="leading-tight">
              <span className="block text-[12px] font-bold text-white">
                {user.name}
              </span>
              <span className="block text-[11px] text-slate-400">
                {user.email}
              </span>
            </span>
          </div>

          {onReplayTour && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReplayTour}
              icon={<HelpCircle size={16} />}
              aria-label="Ver tutorial"
              title="Ver tutorial"
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
