/**
 * Copia texto al portapapeles. Usa navigator.clipboard cuando el
 * navegador lo permite (contextos seguros: HTTPS o localhost); si no
 * está disponible (ej. HTTP plano con IP), usa un método alternativo
 * con un textarea temporal, compatible con cualquier navegador.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}
