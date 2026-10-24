import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';

/**
 * IaService extiende y mantiene compatibilidad directa con AiService.
 */
@Injectable()
export class IaService extends AiService {}

export * from './ai.service';
