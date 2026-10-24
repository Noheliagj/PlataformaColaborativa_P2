import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

/** Tipo UML de la relación (RF7). */
export type RelationType =
  | 'ASSOCIATION'
  | 'AGGREGATION'
  | 'COMPOSITION'
  | 'INHERITANCE'
  | 'REALIZATION'
  | 'DEPENDENCY';

/** Estilo de trazo/enrutamiento elegido en "Propiedades de relación" (RF7). */
export type EdgeRouteStyle =
  | 'ORTHOGONAL_SOFT'
  | 'ORTHOGONAL_90'
  | 'STRAIGHT'
  | 'BEZIER';

/** Datos de una asociación entre clases (se guardan en edge.data). */
export type ClassEdgeData = {
  relationName?: string;
  sourceCardinality?: string;
  targetCardinality?: string;
  relationType?: RelationType;
  sourceRole?: string;
  targetRole?: string;
  edgeStyle?: EdgeRouteStyle;
  isAuxiliary?: boolean;
  mainEdgeId?: string;
};

const LABEL_CLASS =
  'absolute select-none whitespace-nowrap rounded-md border border-hairline-strong ' +
  'bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)] ' +
  'pointer-events-auto';

const CARD_CLASS =
  'absolute select-none whitespace-nowrap rounded border border-hairline-strong ' +
  'bg-raised px-1 py-px font-mono text-[10px] text-ink-soft ' +
  'pointer-events-auto';

const ROLE_CLASS =
  'absolute select-none whitespace-nowrap rounded border border-hairline ' +
  'bg-sunken px-1 py-px text-[9px] italic text-ink-faint ' +
  'pointer-events-auto';

/** Calcula el trazo (path) + punto de etiqueta según el estilo elegido. */
function buildPath(
  style: EdgeRouteStyle | undefined,
  params: {
    sourceX: number;
    sourceY: number;
    sourcePosition: EdgeProps['sourcePosition'];
    targetX: number;
    targetY: number;
    targetPosition: EdgeProps['targetPosition'];
  },
) {
  switch (style) {
    case 'STRAIGHT':
      return getStraightPath(params);
    case 'ORTHOGONAL_90':
      return getSmoothStepPath({ ...params, borderRadius: 0 });
    case 'ORTHOGONAL_SOFT':
      return getSmoothStepPath({ ...params, borderRadius: 10 });
    case 'BEZIER':
    default:
      return getBezierPath(params);
  }
}

/** Línea sólida (relaciones "fuertes": asociación/agregación/composición/herencia). */
const SOLID: React.CSSProperties = {};
/** Línea punteada (realización/dependencia). */
const DASHED: React.CSSProperties = { strokeDasharray: '6 4' };

/**
 * RF7 - Arista UML completa: dibuja el trazo según `edgeStyle`, la punta
 * según `relationType` (rombo hueco/relleno, triángulo, flecha abierta) y
 * hasta cinco etiquetas opcionales (nombre, cardinalidades y roles).
 */
export function CustomEdge({
  id,
  source,
  target: _target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const { getNode, getEdge, getEdges } = useReactFlow();
  const {
    relationName,
    sourceCardinality,
    targetCardinality,
    sourceRole,
    targetRole,
    relationType = 'ASSOCIATION',
    edgeStyle = 'ORTHOGONAL_SOFT',
  } = (data ?? {}) as ClassEdgeData;

  const isAuxiliary = Boolean((data as ClassEdgeData | undefined)?.isAuxiliary);

  let effectiveSourceX = sourceX;
  let effectiveSourceY = sourceY;

  // Para clases de asociación: la línea punteada nace exactamente del punto medio
  // de la línea sólida principal que conecta a las dos clases principales (UML standard)
  if (isAuxiliary) {
    const mainEdgeId = (data as ClassEdgeData | undefined)?.mainEdgeId;
    let mainEdge = mainEdgeId ? getEdge(mainEdgeId) : null;

    if (!mainEdge) {
      const allEdges = getEdges();
      mainEdge =
        allEdges.find(
          (e) =>
            !e.data?.isAuxiliary &&
            (e.source === source || e.target === source),
        ) ?? null;
    }

    if (mainEdge) {
      const srcNode = getNode(mainEdge.source);
      const tgtNode = getNode(mainEdge.target);

      if (srcNode && tgtNode) {
        const srcW = (srcNode as any).measured?.width ?? 212;
        const srcH = (srcNode as any).measured?.height ?? 120;
        const tgtW = (tgtNode as any).measured?.width ?? 212;
        const tgtH = (tgtNode as any).measured?.height ?? 120;

        const getHandleCoords = (
          node: any,
          handleId: string | undefined | null,
          w: number,
          h: number,
        ) => {
          const posX = node.position.x;
          const posY = node.position.y;
          if (!handleId) {
            return { x: posX + w / 2, y: posY + h / 2 };
          }
          if (handleId.includes('right')) return { x: posX + w, y: posY + h / 2 };
          if (handleId.includes('left')) return { x: posX, y: posY + h / 2 };
          if (handleId.includes('bottom')) return { x: posX + w / 2, y: posY + h };
          if (handleId.includes('top')) return { x: posX + w / 2, y: posY };
          return { x: posX + w / 2, y: posY + h / 2 };
        };

        const pt1 = getHandleCoords(srcNode, mainEdge.sourceHandle, srcW, srcH);
        const pt2 = getHandleCoords(tgtNode, mainEdge.targetHandle, tgtW, tgtH);

        // (x_origen + x_destino) / 2 , (y_origen + y_destino) / 2
        effectiveSourceX = (pt1.x + pt2.x) / 2;
        effectiveSourceY = (pt1.y + pt2.y) / 2;
      }
    }
  }

  const [edgePath, labelX, labelY] = isAuxiliary
    ? getStraightPath({
        sourceX: effectiveSourceX,
        sourceY: effectiveSourceY,
        targetX,
        targetY,
      })
    : buildPath(edgeStyle, {
        sourceX: effectiveSourceX,
        sourceY: effectiveSourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });

  // Cardinalidades/roles: un 18%/30% hacia el interior desde cada extremo.
  const srcX = effectiveSourceX + (targetX - effectiveSourceX) * 0.18;
  const srcY = effectiveSourceY + (targetY - effectiveSourceY) * 0.18;
  const tgtX = effectiveSourceX + (targetX - effectiveSourceX) * 0.82;
  const tgtY = effectiveSourceY + (targetY - effectiveSourceY) * 0.82;
  const srcRoleX = effectiveSourceX + (targetX - effectiveSourceX) * 0.32;
  const srcRoleY = effectiveSourceY + (targetY - effectiveSourceY) * 0.32;
  const tgtRoleX = effectiveSourceX + (targetX - effectiveSourceX) * 0.68;
  const tgtRoleY = effectiveSourceY + (targetY - effectiveSourceY) * 0.68;

  const stroke = selected ? '#7c86e6' : '#6b6d78';
  const strokeWidth = selected ? 2 : 1.5;
  const lineStyle: React.CSSProperties =
    relationType === 'REALIZATION' || relationType === 'DEPENDENCY' || isAuxiliary
      ? { ...DASHED, stroke, strokeWidth }
      : { ...SOLID, stroke, strokeWidth };

  const angleDeg =
    (Math.atan2(targetY - effectiveSourceY, targetX - effectiveSourceX) * 180) / Math.PI;

  // Relleno "hueco" de rombo/triángulo: el color de fondo del lienzo, para
  // que se vea como un hueco y no como una forma sólida del color de línea.
  const holeFill = 'var(--color-surface, #16171b)';

  let sourceIcon: React.ReactNode = null;
  let targetIcon: React.ReactNode = null;

  if (isAuxiliary) {
    // Línea auxiliar de clase asociativa UML: trazo punteado puro sin puntas de flecha
    sourceIcon = null;
    targetIcon = null;
  } else if (relationType === 'AGGREGATION') {
    sourceIcon = (
      <path d="M0,0 L9,-6 L18,0 L9,6 Z" fill={holeFill} stroke={stroke} strokeWidth={1.4} />
    );
  } else if (relationType === 'COMPOSITION') {
    sourceIcon = (
      <path d="M0,0 L9,-6 L18,0 L9,6 Z" fill={stroke} stroke={stroke} strokeWidth={1.4} />
    );
  } else if (relationType === 'INHERITANCE') {
    targetIcon = <path d="M0,0 L-14,-7 L-14,7 Z" fill={stroke} />;
  } else if (relationType === 'REALIZATION') {
    targetIcon = (
      <path d="M0,0 L-14,-7 L-14,7 Z" fill={holeFill} stroke={stroke} strokeWidth={1.4} />
    );
  } else {
    // ASSOCIATION y DEPENDENCY: flecha abierta simple.
    targetIcon = (
      <path d="M-13,-6 L0,0 L-13,6" fill="none" stroke={stroke} strokeWidth={1.6} />
    );
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={lineStyle} />
      {isAuxiliary && (
        <circle
          cx={effectiveSourceX}
          cy={effectiveSourceY}
          r={3.5}
          fill={stroke}
        />
      )}
      {sourceIcon && (
        <g transform={`translate(${effectiveSourceX},${effectiveSourceY}) rotate(${angleDeg})`}>
          {sourceIcon}
        </g>
      )}
      {targetIcon && (
        <g transform={`translate(${targetX},${targetY}) rotate(${angleDeg})`}>
          {targetIcon}
        </g>
      )}
      <EdgeLabelRenderer>
        {relationName && (
          <div
            className={LABEL_CLASS}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {relationName}
          </div>
        )}
        {sourceCardinality && (
          <div
            className={CARD_CLASS}
            style={{
              transform: `translate(-50%, -50%) translate(${srcX}px, ${srcY}px)`,
            }}
          >
            {sourceCardinality}
          </div>
        )}
        {targetCardinality && (
          <div
            className={CARD_CLASS}
            style={{
              transform: `translate(-50%, -50%) translate(${tgtX}px, ${tgtY}px)`,
            }}
          >
            {targetCardinality}
          </div>
        )}
        {sourceRole && (
          <div
            className={ROLE_CLASS}
            style={{
              transform: `translate(-50%, -50%) translate(${srcRoleX}px, ${srcRoleY}px)`,
            }}
          >
            {sourceRole}
          </div>
        )}
        {targetRole && (
          <div
            className={ROLE_CLASS}
            style={{
              transform: `translate(-50%, -50%) translate(${tgtRoleX}px, ${tgtRoleY}px)`,
            }}
          >
            {targetRole}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
