/**
 * `crypto.randomUUID()` solo existe en contextos seguros (HTTPS o
 * localhost). Este helper cae a un generador manual de UUID v4 cuando no
 * está disponible, para no romper la creación de clases/aristas en un
 * despliegue que todavía no tenga HTTPS.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
