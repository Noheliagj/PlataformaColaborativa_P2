import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { WebsocketsModule } from '../websockets/websockets.module';
import { NosqlModule } from '../nosql/nosql.module';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';
import { AiService } from './ai.service';

/** RF11: Asistente de IA (Anthropic Claude + function calling) sobre el diagrama relacional. */
@Module({
  imports: [
    AuthModule,
    ProjectsModule,
    NosqlModule,
    forwardRef(() => WebsocketsModule),
  ],
  controllers: [IaController],
  providers: [AiService, IaService],
  exports: [AiService, IaService],
})
export class IaModule {}
