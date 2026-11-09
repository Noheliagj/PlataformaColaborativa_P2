import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
