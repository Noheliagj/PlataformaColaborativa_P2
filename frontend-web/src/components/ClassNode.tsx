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
      className={`min-w-[212px] overflow-hidden rounded-lg border bg-surface font-sans text-[11px] text-ink-soft shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] transition-colors ${
        selected
          ? 'border-accent ring-2 ring-accent-soft'
          : isAssociative
            ? 'border-dashed border-accent-hi/70'
            : 'border-hairline-strong'
      }`}
    >
      {/* RF6: un handle de entrada y uno de salida en cada uno de los 4
          lados, para poder conectar/soltar relaciones desde cualquier
          costado de la clase (no solo arriba/abajo). isConnectableStart/
          End en true en los cuatro para poder arrastrar la línea a partir
          de cualquiera de ellos, sea "source" o "target". */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />

      {/* Cabecera */}
      <div className="relative border-b border-hairline-strong bg-raised px-3 py-2 text-center">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
        <span className="block font-mono text-[9px] tracking-[0.14em] text-ink-faint uppercase">
          {isAssociative ? '«association class»' : '«class»'}
        </span>
        <span className="block text-[13px] font-semibold text-ink">
          {name ?? 'NuevaClase'}
        </span>
      </div>

      {/* Atributos */}
      <ul className="space-y-1 px-3 py-2 font-mono">
        {attributes && attributes.length > 0 ? (
          attributes.map((attr, i) => (
            <li
              key={i}
              className="flex gap-1.5 whitespace-nowrap text-ink-soft"
            >
              <span className="text-accent-hi">−</span>
              {attr}
            </li>
          ))
        ) : (
          <li className="text-ink-faint italic">sin atributos</li>
        )}
      </ul>

      {/* Métodos */}
      <ul className="space-y-1 border-t border-hairline px-3 py-2 font-mono">
        {methods && methods.length > 0 ? (
          methods.map((method, i) => (
            <li
              key={i}
              className="flex gap-1.5 whitespace-nowrap text-ink-soft"
            >
              <span className="text-positive">+</span>
              {method}
            </li>
          ))
        ) : (
          <li className="text-ink-faint italic">sin métodos</li>
        )}
      </ul>

      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
      <Handle
        id="bottom-source"
        type="source"
        position={Position.Bottom}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
    </div>
  );
}
