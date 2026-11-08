import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../../lib/useTheme';

const HIGHLIGHTS = [
  'Diagramas de clases colaborativos en tiempo real',
  'Modelo de base de datos derivado automáticamente',
  'Generación de backend Spring Boot en un clic',
];

/**
 * Marco compartido de las pantallas de acceso: panel de marca a la
 * izquierda (solo escritorio) y contenido del formulario a la derecha.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="relative grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      {/* Luces difusas de fondo (Glow) */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-sky-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[140px]" />

      <ThemeToggle
        theme={theme}
        onToggle={toggleTheme}
        className="absolute top-5 right-5 z-10"
      />
      {/* Panel de marca */}
      <aside className="bg-halo relative hidden flex-col justify-between overflow-hidden border-r border-hairline bg-sunken p-12 lg:flex">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex items-center justify-between">
          <Link to="/" className="inline-block">
            <Brand size="lg" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
            ⚡ Plataforma Colaborativa P2
          </span>
        </div>

        <div className="relative max-w-md space-y-8">
          <h2 className="text-[28px] leading-tight font-extrabold text-ink tracking-tight">
            Del diagrama al backend, <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">sin fricción</span>.
          </h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-ink-soft">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-sky-500/40 bg-surface text-accent shadow-sm">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8.5 6.5 12 13 4.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="font-medium text-ink-soft">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-ink-faint">
          Plataforma académica de ingeniería de software · 2026
        </p>
      </aside>

      {/* Panel del formulario con contenedor estilizado */}
      <main className="relative flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 lg:hidden" />
        <div className="animate-fade-rise relative w-full max-w-md rounded-2xl border border-hairline-strong bg-surface/90 p-8 shadow-2xl backdrop-blur-xl ring-1 ring-hairline sm:p-10">
          <div className="mb-6 flex justify-center lg:hidden">
            <Brand size="lg" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
