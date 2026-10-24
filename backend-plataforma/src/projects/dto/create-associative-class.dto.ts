export class CreateAssociativeClassDto {
  sourceClassId!: string;
  targetClassId!: string;
  name?: string;
  attributes?: string[];
  methods?: string[];
}

