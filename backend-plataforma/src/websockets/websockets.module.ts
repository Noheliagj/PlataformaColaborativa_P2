import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NosqlModule } from '../nosql/nosql.module';
import { IaModule } from '../ia/ia.module';
import { DiagramGateway } from './diagram.gateway';

/**
 * RF10: gateway de colaboración en tiempo real sobre el diagrama.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProjectsModule,
    NotificationsModule,
    NosqlModule,
    forwardRef(() => IaModule),
  ],
  providers: [DiagramGateway],
  exports: [DiagramGateway],
})
export class WebsocketsModule {}
