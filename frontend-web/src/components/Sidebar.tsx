import { ArrowLeftRight, Plus, Trash2, X } from 'lucide-react';
import type { ClassNodeData } from './ClassNode';
import type { ClassEdgeData, EdgeRouteStyle, RelationType } from './CustomEdge';

type ListKey = 'attributes' | 'methods';

/** Opciones de cardinalidad ofrecidas para las asociaciones. */
const CARDINALITIES = ['1', '0..1', 'N', '0..*'];

/** RF7: las 6 tarjetas de "TIPO DE RELACIÓN UML". */
const RELATION_TYPES: Array<{
  value: RelationType;
  label: string;
  hint: string;
}> = [
  { value: 'ASSOCIATION', label: 'Asociación', hint: 'Línea con flecha' },
  { value: 'AGGREGATION', label: 'Agregación', hint: 'Rombo hueco' },
  { value: 'COMPOSITION', label: 'Composición', hint: 'Rombo relleno' },
  { value: 'INHERITANCE', label: 'Herencia', hint: 'Triángulo cerrado' },
  { value: 'REALIZATION', label: 'Realización', hint: 'Punteada + triángulo' },
  { value: 'DEPENDENCY', label: 'Dependencia', hint: 'Punteada + flecha' },
];

/** RF7: las 4 tarjetas de "ESTILO DE TRAZO / ENRUTAMIENTO". */
const EDGE_STYLES: Array<{
  value: EdgeRouteStyle;
  label: string;
  hint: string;
}> = [
  { value: 'ORTHOGONAL_SOFT', label: 'Ortogonal Suave', hint: 'Horizontal/vertical suave' },
  { value: 'ORTHOGONAL_90', label: 'Ortogonal 90°', hint: 'Ángulos rectos puros' },
  { value: 'STRAIGHT', label: 'Línea Recta', hint: 'Directa/diagonal' },
  { value: 'BEZIER', label: 'Curva Bézier', hint: 'Fluida y orgánica' },
];

const INPUT_CLASS =
  'w-full min-w-0 rounded-lg border border-hairline-strong bg-sunken px-3 py-2 font-mono text-[13px] text-ink ' +
  'outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent-soft';

const FIELD_LABEL =
  'block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint';

type SidebarProps =
  | {
      kind: 'node';
      data: ClassNodeData;
      onChange: (patch: Partial<ClassNodeData>) => void;
      onClose: () => void;
    }
  | {
      kind: 'edge';
      data: ClassEdgeData;
      onChange: (patch: Partial<ClassEdgeData>) => void;
      onClose: () => void;
      /** RF7: invierte origen/destino de la relación seleccionada. */
      onReverse?: () => void;
      /** RF7: crea la clase asociativa para esta relación N:M (solo cuando
       * ambas cardinalidades son "muchos" y aún no se convirtió). */
      onConvertToAssociative?: () => void;
      canConvertToAssociative?: boolean;
    };

/**
 * RF6 - Panel de inspección. Muestra el formulario de clase o el de
 * asociación según lo que esté seleccionado en el lienzo.
 */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="absolute top-0 right-0 z-20 flex h-full w-[300px] flex-col overflow-y-auto border-l border-hairline bg-surface/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <h3 className="text-[13px] font-semibold text-ink">
            {props.kind === 'edge' ? 'Propiedades de Relación' : 'Inspector · Clase'}
          </h3>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="-mr-1 rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          aria-label="Cerrar panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-6 p-4">
        {props.kind === 'edge' ? (
          <EdgeForm
            data={props.data}
            onChange={props.onChange}
            onReverse={props.onReverse}
            onConvertToAssociative={props.onConvertToAssociative}
            canConvertToAssociative={props.canConvertToAssociative}
          />
        ) : (
          <NodeForm data={props.data} onChange={props.onChange} />
        )}
      </div>
    </aside>
  );
}

function CardinalityPicker({
  value,
  onPick,
}: {
  value: string | undefined;
  onPick: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-lg border border-hairline-strong bg-sunken p-1">
      {CARDINALITIES.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(active ? '' : c)}
            className={`rounded-md py-1.5 font-mono text-[12px] transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function EdgeForm({
  data,
  onChange,
  onReverse,
  onConvertToAssociative,
  canConvertToAssociative,
}: {
  data: ClassEdgeData;
  onChange: (patch: Partial<ClassEdgeData>) => void;
  onReverse?: () => void;
  onConvertToAssociative?: () => void;
  canConvertToAssociative?: boolean;
}) {
  const relationType = data.relationType ?? 'ASSOCIATION';
  const edgeStyle = data.edgeStyle ?? 'ORTHOGONAL_SOFT';

  return (
    <>
      {/* ORIENTACIÓN */}
      <div className="space-y-1.5">
        <span className={FIELD_LABEL}>Orientación</span>
        <button
          type="button"
          onClick={onReverse}
          disabled={!onReverse}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-hairline-strong bg-sunken px-3 py-2 text-[12px] font-medium text-ink-soft transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
        >
          <ArrowLeftRight size={14} />
          Invertir Dirección
        </button>
      </div>

      {canConvertToAssociative && onConvertToAssociative && (
        <div className="space-y-1.5 rounded-lg border border-dashed border-accent-hi/60 bg-accent-soft/20 p-3">
          <p className="text-[11px] leading-snug text-ink-soft">
            Ambos extremos son "muchos": esta relación es N:M. Puedes
            convertirla en una clase intermedia (asociativa).
          </p>
          <button
            type="button"
            onClick={onConvertToAssociative}
            className="w-full rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hi"
          >
            Añadir clase intermedia
          </button>
        </div>
      )}

      {/* TIPO DE RELACIÓN UML */}
      <div className="space-y-1.5">
        <span className={FIELD_LABEL}>Tipo de relación UML</span>
        <div className="grid grid-cols-2 gap-1.5">
          {RELATION_TYPES.map((opt) => {
            const active = relationType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ relationType: opt.value })}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft/30'
                    : 'border-hairline-strong bg-sunken hover:bg-raised'
                }`}
              >
                <span
                  className={`block text-[11px] font-semibold ${active ? 'text-accent-hi' : 'text-ink'}`}
                >
                  {opt.label}
                </span>
                <span className="block text-[9px] text-ink-faint">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ESTILO DE TRAZO / ENRUTAMIENTO */}
      <div className="space-y-1.5">
        <span className={FIELD_LABEL}>Estilo de trazo / enrutamiento</span>
        <div className="grid grid-cols-2 gap-1.5">
          {EDGE_STYLES.map((opt) => {
            const active = edgeStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ edgeStyle: opt.value })}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft/30'
                    : 'border-hairline-strong bg-sunken hover:bg-raised'
                }`}
              >
                <span
                  className={`block text-[11px] font-semibold ${active ? 'text-accent-hi' : 'text-ink'}`}
                >
                  {opt.label}
                </span>
                <span className="block text-[9px] text-ink-faint">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-hairline" />

      <label className="block space-y-1.5">
        <span className={FIELD_LABEL}>Etiqueta o verbo de relación</span>
        <input
          className={INPUT_CLASS}
          value={data.relationName ?? ''}
          onChange={(e) => onChange({ relationName: e.target.value })}
          placeholder="ej: pertenece_a, gestiona, contiene"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1.5">
          <span className={FIELD_LABEL}>Rol origen</span>
          <input
            className={INPUT_CLASS}
            value={data.sourceRole ?? ''}
            onChange={(e) => onChange({ sourceRole: e.target.value })}
            placeholder="ej: propietario"
          />
        </label>
        <label className="block space-y-1.5">
          <span className={FIELD_LABEL}>Rol destino</span>
          <input
            className={INPUT_CLASS}
            value={data.targetRole ?? ''}
            onChange={(e) => onChange({ targetRole: e.target.value })}
            placeholder="ej: cuenta"
          />
        </label>
      </div>

      <div className="h-px bg-hairline" />

      <div className="space-y-1.5">
        <span className={FIELD_LABEL}>Cardinalidad origen</span>
        <CardinalityPicker
          value={data.sourceCardinality}
          onPick={(v) => onChange({ sourceCardinality: v })}
        />
      </div>

      <div className="space-y-1.5">
        <span className={FIELD_LABEL}>Cardinalidad destino</span>
        <CardinalityPicker
          value={data.targetCardinality}
          onPick={(v) => onChange({ targetCardinality: v })}
        />
      </div>
    </>
  );
}

function NodeForm({
  data,
  onChange,
}: {
  data: ClassNodeData;
  onChange: (patch: Partial<ClassNodeData>) => void;
}) {
  const attributes = data.attributes ?? [];
  const methods = data.methods ?? [];

  const setList = (key: ListKey, values: string[]) => {
    onChange({ [key]: values } as Partial<ClassNodeData>);
  };

  const updateItem = (key: ListKey, index: number, value: string) => {
    const next = [...(data[key] ?? [])];
    next[index] = value;
    setList(key, next);
  };

  const addItem = (key: ListKey) => setList(key, [...(data[key] ?? []), '']);

  const removeItem = (key: ListKey, index: number) => {
    setList(
      key,
      (data[key] ?? []).filter((_, i) => i !== index),
    );
  };

  const renderList = (key: ListKey, label: string, items: string[]) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={FIELD_LABEL}>{label}</span>
        <button
          type="button"
          onClick={() => addItem(key)}
          title={`Añadir ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-raised px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-overlay hover:text-ink"
        >
          <Plus size={12} /> Añadir
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-[12px] text-ink-faint italic">
          Sin {label.toLowerCase()}
        </p>
      )}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div className="flex gap-2" key={index}>
            <input
              className={INPUT_CLASS}
              value={item}
              onChange={(e) => updateItem(key, index, e.target.value)}
              placeholder={
                key === 'attributes' ? 'campo: tipo' : 'metodo(): tipo'
              }
            />
            <button
              type="button"
              onClick={() => removeItem(key, index)}
              title="Eliminar"
              className="shrink-0 rounded-lg border border-critical/40 px-2 text-critical transition-colors hover:bg-critical-soft"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <label className="block space-y-1.5">
        <span className={FIELD_LABEL}>Nombre de la clase</span>
        <input
          className={INPUT_CLASS}
          value={data.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="NombreClase"
        />
      </label>

      <div className="h-px bg-hairline" />

      {renderList('attributes', 'Atributos', attributes)}
      {renderList('methods', 'Métodos', methods)}
    </>
  );
}
