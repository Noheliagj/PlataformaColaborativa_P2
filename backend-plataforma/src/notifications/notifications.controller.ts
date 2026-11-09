import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { FcmTokenDto } from './dto/fcm-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // GET /notifications -> listar notificaciones persistidas del usuario
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.notifications.findAllForUser(user.id);
  }

  // PATCH /notifications/read-all -> marcar todas como leídas
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllAsRead(user.id);
  }

  // PATCH /notifications/:id/read -> marcar una notificación específica como leída
  @Patch(':id/read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') notificationId: string,
  ) {
    return this.notifications.markAsRead(user.id, notificationId);
  }

  // POST /notifications/push-subscription -> guarda la suscripción Web Push
  // del navegador actual para el usuario autenticado.
  @Post('push-subscription')
  savePushSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscriptionDto,
  ) {
    return this.notifications.saveSubscription(user.id, dto);
  }

  // POST /notifications/fcm-token -> guarda el token de Firebase del móvil
  @Post('fcm-token')
  saveFcmToken(@CurrentUser() user: AuthUser, @Body() dto: FcmTokenDto) {
    return this.notifications.saveFcmToken(user.id, dto.token);
  }
}
