import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as webpush from 'web-push';
import * as admin from 'firebase-admin';
import { Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushSubscriptionDto } from './dto/push-subscription.dto';

export type NotificationType = 'MEMBER_JOINED' | 'DIAGRAM_SAVED';

interface NotifyOwnerInput {
  ownerId: string;
  projectId: string;
  type: NotificationType;
  message: string;
}

export interface RoomNotificationInput {
  projectId: string;
  type: string;
  message: string;
  userId: string;
  userName: string;
}

@Injectable()
export class NotificationsService extends EventEmitter {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly pushEnabled: boolean;
  private firebaseInitialized = false;

  constructor(private readonly prisma: PrismaService) {
    super();

    // 1. Inicializar Web Push (VAPID) para navegadores
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.pushEnabled = Boolean(publicKey && privateKey);
    if (this.pushEnabled) {
      webpush.setVapidDetails(
        'mailto:soporte@uml-studio.local',
        publicKey!,
        privateKey!,
      );
    } else {
      this.logger.warn(
        'VAPID no configurado: Web Push para navegador deshabilitado.',
      );
    }

    // 2. Inicializar Firebase Admin SDK para notificaciones Push en móviles Android
    try {
      const candidates = [
        path.resolve(process.cwd(), 'firebase-adminsdk.json'),
        path.resolve(process.cwd(), 'backend-plataforma', 'firebase-adminsdk.json'),
        path.resolve(__dirname, '..', '..', 'firebase-adminsdk.json'),
      ];
      const certPath = candidates.find((p) => fs.existsSync(p));

      if (certPath && !admin.apps.length) {
        const serviceAccount = JSON.parse(fs.readFileSync(certPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.firebaseInitialized = true;
        this.logger.log(`Firebase Admin SDK inicializado exitosamente desde: ${certPath}`);
      } else if (admin.apps.length) {
        this.firebaseInitialized = true;
      } else {
        this.logger.warn(
          'firebase-adminsdk.json no encontrado: Notificaciones Push nativas Android en espera de credenciales.',
        );
      }
    } catch (err) {
      this.logger.error(`Error al inicializar Firebase Admin SDK: ${(err as Error).message}`);
    }
  }

  async notifyOwner(input: NotifyOwnerInput): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.ownerId,
        projectId: input.projectId,
        type: input.type,
        message: input.message,
      },
    });

    // Retransmitir por Socket.IO in-app
    this.emit('notification', notification);

    // Enviar Web Push para navegadores
    await this.sendWebPush(input.ownerId, notification);

    // Enviar Firebase Push para celulares Android (bandeja de entrada del sistema)
    await this.sendFcmPush([input.ownerId], 'UML Studio', input.message, {
      projectId: input.projectId,
      type: input.type,
    });

    return notification;
  }

  /**
   * Notificación para todos los colaboradores de la sala del proyecto.
   */
  async notifyRoom(input: RoomNotificationInput): Promise<void> {
    this.emit('room-notification', {
      ...input,
      timestamp: new Date().toISOString(),
    });

    // Notificar a todos los miembros y al dueño (excepto a quien originó la acción)
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
        include: { members: true },
      });
      if (project) {
        const recipients = [
          project.ownerId,
          ...project.members.map((m) => m.userId),
        ].filter((id) => id !== input.userId);

        if (recipients.length > 0) {
          await this.sendFcmPush(
            recipients,
            `UML Studio · ${input.userName}`,
            input.message,
            { projectId: input.projectId, type: input.type },
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Error al enviar FCM a la sala: ${(err as Error).message}`);
    }
  }

  async saveSubscription(
    userId: string,
    dto: PushSubscriptionDto,
  ): Promise<{ id: string }> {
    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
    return { id: sub.id };
  }

  /**
   * Registra o actualiza el token FCM de un dispositivo móvil Android.
   */
  async saveFcmToken(userId: string, token: string): Promise<{ success: boolean }> {
    if (!token) return { success: false };
    try {
      await this.prisma.fcmDevice.upsert({
        where: { token },
        create: { userId, token },
        update: { userId },
      });
      this.logger.log(`[FCM] Dispositivo móvil registrado para el usuario ${userId}`);
      return { success: true };
    } catch (err) {
      this.logger.error(`Error al guardar token FCM: ${(err as Error).message}`);
      return { success: false };
    }
  }

  /**
   * Envía notificación Push nativa mediante Firebase Cloud Messaging a la bandeja del sistema Android.
   */
  private async sendFcmPush(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    if (!this.firebaseInitialized || !userIds.length) return;

    try {
      const devices = await this.prisma.fcmDevice.findMany({
        where: { userId: { in: userIds } },
      });

      if (!devices.length) return;

      const tokens = Array.from(new Set(devices.map((d) => d.token)));

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'uml_studio_channel',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      });

      this.logger.log(
        `[FCM] Notificación enviada. Éxitos: ${response.successCount}, Fallos: ${response.failureCount}`,
      );

      // Limpiar tokens inválidos si la app fue desinstalada
      if (response.failureCount > 0) {
        response.responses.forEach(async (resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              const deadToken = tokens[idx];
              await this.prisma.fcmDevice
                .delete({ where: { token: deadToken } })
                .catch(() => {});
            }
          }
        });
      }
    } catch (err) {
      this.logger.error(`Error enviando notificación FCM: ${(err as Error).message}`);
    }
  }

  private async sendWebPush(
    userId: string,
    notification: Notification,
  ): Promise<void> {
    if (!this.pushEnabled) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      title: 'UML Studio',
      body: notification.message,
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
        } catch (err) {
          const statusCode =
            err instanceof webpush.WebPushError ? err.statusCode : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          } else {
            this.logger.warn(
              `No se pudo enviar Web Push a la suscripción ${sub.id}: ${String(err)}`,
            );
          }
        }
      }),
    );
  }
}
