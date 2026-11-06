import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NosqlModule } from '../nosql/nosql.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * RF3. Importa AuthModule para reutilizar la configuración de Passport
 * (necesaria para JwtAuthGuard). PrismaModule es global. NotificationsModule
 * para avisar al dueño cuando alguien se une o guarda cambios. NosqlModule
 * para sesiones continuas y sincronización híbrida (PostgreSQL + MongoDB).
 */
@Module({
  imports: [AuthModule, NotificationsModule, NosqlModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
