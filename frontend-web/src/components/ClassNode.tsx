import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

/** Datos que lleva cada nodo de clase. `type` (no `interface`) para que
 *  sea compatible con el genérico Node<T> de React Flow. */
export type ClassNodeData = {
  name?: string;
  attributes?: string[];
  methods?: string[];
  // RF7: true si esta clase se generó automáticamente como la clase
  // asociativa de una relación muchos-a-muchos (ver EditorPage.tsx).
  isAssociative?: boolean;
};

const HANDLE_CLASS =
  '!h-2 !w-2 !rounded-full !border !border-canvas !bg-[color:var(--color-accent)]';

/**
 * RF4 - Nodo con la forma de una clase UML: cabecera (estereotipo +
 * nombre) sobre las secciones de atributos y de métodos.
 */
export function ClassNode({ data, selected }: NodeProps) {
  const { name, attributes, methods, isAssociative } = data as ClassNodeData;

  return (
    <div
      className={`min-w-[220px] overflow-hidden rounded-xl border font-sans text-[11px] shadow-lg transition-all duration-200 ${
        selected
          ? 'border-sky-400 ring-4 ring-sky-500/25 shadow-[0_0_30px_rgba(56,189,248,0.3)] bg-surface'
          : isAssociative
            ? 'border-purple-500/80 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-surface'
            : 'border-hairline-strong bg-surface hover:border-accent hover:shadow-xl'
      }`}
    >
      {/* Handles */}
      <Handle id="top-target" type="target" position={Position.Top} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="top-source" type="source" position={Position.Top} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="right-target" type="target" position={Position.Right} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="right-source" type="source" position={Position.Right} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="left-target" type="target" position={Position.Left} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="left-source" type="source" position={Position.Left} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />

      {/* Cabecera de la Clase */}
      <div
        className={`relative px-3.5 py-2.5 text-center border-b ${
          isAssociative
            ? 'bg-purple-500/15 border-purple-500/30'
            : 'bg-raised/90 border-hairline'
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 w-1 ${
            isAssociative
              ? 'bg-gradient-to-b from-purple-400 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'
              : 'bg-gradient-to-b from-sky-400 to-blue-500 shadow-[0_0_8px_rgba(56,189,248,0.8)]'
          }`}
        />

        <div className="mb-1 flex items-center justify-center">
          {isAssociative ? (
            <span className="inline-flex items-center rounded-full border border-purple-400/50 bg-purple-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wider text-purple-600 dark:text-purple-300 uppercase shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              ⚡ Clase Asociativa (N:M)
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-sky-600 dark:text-sky-300 uppercase">
              «Clase UML»
            </span>
          )}
        </div>

        <span className="block text-[14px] font-extrabold tracking-tight text-ink drop-shadow-xs">
          {name ?? 'NuevaClase'}
        </span>
      </div>

      {/* Atributos */}
      <div className="px-3.5 py-2.5 bg-sunken/60">
        <span className="block text-[9px] font-bold tracking-wider text-ink-muted uppercase mb-1.5">
          Atributos ({attributes?.length ?? 0})
        </span>
        <ul className="space-y-1 font-mono text-[11px]">
          {attributes && attributes.length > 0 ? (
            attributes.map((attr, i) => (
              <li key={i} className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                <span className="font-bold text-sky-500">−</span>
                <span className="font-medium text-ink-soft">{attr}</span>
              </li>
            ))
          ) : (
            <li className="text-ink-faint italic text-[10px]">sin atributos</li>
          )}
        </ul>
      </div>

      {/* Métodos */}
      <div className="px-3.5 py-2.5 border-t border-hairline bg-sunken/90">
        <span className="block text-[9px] font-bold tracking-wider text-ink-muted uppercase mb-1.5">
          Métodos ({methods?.length ?? 0})
        </span>
        <ul className="space-y-1 font-mono text-[11px]">
          {methods && methods.length > 0 ? (
            methods.map((method, i) => (
              <li key={i} className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                <span className="font-bold text-emerald-500">+</span>
                <span className="font-medium text-ink-soft">{method}</span>
              </li>
            ))
          ) : (
            <li className="text-ink-faint italic text-[10px]">sin métodos</li>
          )}
        </ul>
      </div>

      <Handle id="bottom-target" type="target" position={Position.Bottom} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
      <Handle id="bottom-source" type="source" position={Position.Bottom} className={HANDLE_CLASS} isConnectableStart isConnectableEnd />
    </div>
  );
}
