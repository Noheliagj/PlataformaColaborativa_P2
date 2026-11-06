import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, User, Mail, Lock, AlertCircle } from 'lucide-react';
import { register, saveSession } from '../services/auth';
import { getErrorMessage } from '../services/http-error';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { AuthShell } from '../components/ui/AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RF1 - Pantalla de registro. */
export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameError =
    touched && name.trim().length < 2 ? 'Indica tu nombre' : null;
  const emailError =
    touched && !EMAIL_RE.test(email) ? 'Introduce un email válido' : null;
  const passwordError =
    touched && password.length < 6 ? 'Mínimo 6 caracteres' : null;

  const valid =
    name.trim().length >= 2 && EMAIL_RE.test(email) && password.length >= 6;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setError(null);
    setLoading(true);
    try {
      const res = await register({ name: name.trim(), email, password });
      saveSession(res);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo completar el registro'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border-2 border-indigo-500/50 bg-[#131b2e] text-indigo-400 shadow-[0_0_25px_rgba(168,85,247,0.3)]">
          <User size={26} className="text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-slate-400">
          Empieza a modelar tu software y colaborar en minutos
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
          id="name"
          label="Nombre"
          type="text"
          autoComplete="name"
          placeholder="Tu nombre"
          icon={<User size={16} />}
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />

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
          autoComplete="new-password"
          placeholder="Al menos 6 caracteres"
          icon={<Lock size={16} />}
          value={password}
          error={passwordError}
          hint="Usa al menos 6 caracteres."
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
        />

        <Button
          type="submit"
          className="mt-2 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-sky-600 text-white font-bold shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:from-indigo-500 hover:to-sky-500 transition-all duration-200"
          loading={loading}
          icon={!loading && <ArrowRight size={16} />}
        >
          {loading ? 'Creando cuenta…' : 'Crear mi cuenta'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-muted">
        ¿Ya tienes cuenta?{' '}
        <Link
          to="/login"
          className="font-medium text-accent-hi transition-colors hover:text-ink"
        >
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
