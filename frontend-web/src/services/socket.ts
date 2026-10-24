import { io, Socket } from 'socket.io-client';
import type { Edge, Node } from '@xyflow/react';
import { API_URL } from './api';

/** Payload que viaja por el canal en tiempo real del diagrama (RF10). */
export interface DiagramUpdatePayload {
  nodes: Node[];
  edges: Edge[];
  fromUserId: string;
  fromUserName: string;
}

/** RF10: usuario conectado ahora mismo a la sala del proyecto. */
export interface PresenceUser {
  userId: string;
  userName: string;
}

export interface PresenceUpdatePayload {
  users: PresenceUser[];
}

/** Chat en tiempo real: mensaje que llega/sale por el evento `chat-message`/`send-message`. */
export interface ChatMessagePayload {
  id: string;
  content: string;
  createdAt: string;
  projectId: string;
  user: { id: string; name: string };
  userId?: string;
  userName?: string;
  actions?: string[];
}

/** Respuesta del Asistente IA emitida por el evento `ai-chat-response`. */
export interface AiChatResponsePayload {
  reply: string;
  actions: string[];
  senderId: string;
  senderName: string;
  timestamp: string;
}

/**
 * Notificación para el dueño de un proyecto (colaborador se unió / guardó
 * cambios). Llega por el evento `notification`, a la sala personal
 * `user:{userId}` -- ver DiagramGateway y NotificationsService.
 */
export interface NotificationPayload {
  id: string;
  type: 'MEMBER_JOINED' | 'DIAGRAM_SAVED';
  message: string;
  projectId: string;
  createdAt: string;
}

/**
 * Abre la conexión al namespace `/diagram` del backend (equivalente al
 * tópico `/topic/diagram/{projectId}`, ver DiagramGateway) autenticada con
 * el mismo JWT que usa la API REST.
 */
export function connectDiagramSocket(): Socket {
  const token = localStorage.getItem('token');
  const WS_ORIGIN = API_URL.replace(/\/api\/?$/, '');
  return io(`${WS_ORIGIN}/diagram`, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}
