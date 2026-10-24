export class CreateRelationshipDto {
  sourceClassId!: string;
  targetClassId!: string;
  name?: string;
  sourceCardinality?: string;
  targetCardinality?: string;
  relationType?: string;
  sourceRole?: string;
  targetRole?: string;
  edgeStyle?: string;
}

