export class DiagramNodeDto {
  id!: string;
  position?: { x: number; y: number };
  data?: {
    name?: string;
    attributes?: string[];
    methods?: string[];
    isAssociative?: boolean;
  };
}

export class DiagramEdgeDto {
  id!: string;
  source!: string;
  target!: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: {
    relationName?: string;
    sourceCardinality?: string;
    targetCardinality?: string;
    relationType?: string;
    sourceRole?: string;
    targetRole?: string;
    edgeStyle?: string;
    isAuxiliary?: boolean;
  };
}

export class UpdateProjectModelDto {
  nodes!: DiagramNodeDto[];
  edges!: DiagramEdgeDto[];
}
