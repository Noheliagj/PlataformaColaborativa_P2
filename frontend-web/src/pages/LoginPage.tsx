import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Lock, AlertCircle } from 'lucide-react';
import { login, saveSession } from '../services/auth';
import { getErrorMessage } from '../services/http-error';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { AuthShell } from '../components/ui/AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RF2 - Pantalla de inicio de sesión. */
export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError =
    touched && !EMAIL_RE.test(email) ? 'Introduce un email válido' : null;
  const passwordError =
    touched && password.length === 0 ? 'La contraseña es obligatoria' : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_RE.test(email) || password.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email, password });
      saveSession(res);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo iniciar sesión'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border-2 border-sky-500/50 bg-[#131b2e] text-sky-400 shadow-[0_0_25px_rgba(56,189,248,0.3)]">
          <Lock size={26} className="text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Inicia sesión</h1>
        <p className="mt-1 text-sm text-slate-400">
          Accede para continuar con tus diagramas y colaborar en vivo
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft px-3.5 py-2.5 text-[13px] text-critical shadow-[0_0_15px_rgba(239,68,68,0.15)]">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          icon={<Mail size={16} />}
          value={email}
          error={emailError}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
        />

        <TextField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          icon={<Lock size={16} />}
          value={password}
          error={passwordError}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
        />

        <Button
          type="submit"
          className="mt-2 w-full bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 text-white font-bold shadow-[0_0_20px_rgba(59,130,246,0.35)] hover:from-blue-500 hover:to-indigo-500 transition-all duration-200"
          loading={loading}
          icon={!loading && <ArrowRight size={16} />}
        >
          {loading ? 'Entrando…' : 'Entrar a la Plataforma'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-muted">
        ¿No tienes cuenta?{' '}
        <Link
          to="/register"
          className="font-medium text-accent-hi transition-colors hover:text-ink"
        >
          Crea una
        </Link>
      </p>
    </AuthShell>
  );
}
