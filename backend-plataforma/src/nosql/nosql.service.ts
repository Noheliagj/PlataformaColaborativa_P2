import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import mongoose from 'mongoose';
import { ChatRoom, IChatRoom } from '../models/nosql/ChatRoom';
import { AddMessageDto } from './dto/add-message.dto';
import { SaveCanvasDto } from './dto/save-canvas.dto';

@Injectable()
export class NosqlService {
  private readonly logger = new Logger(NosqlService.name);

  // Almacenamiento en memoria de respaldo para cuando MongoDB no esté corriendo en local
  private readonly inMemoryRooms = new Map<
    string,
    {
      projectId: string;
      messages: Array<{
        senderId: string;
        senderName: string;
        content: string;
        timestamp: Date;
      }>;
      canvasStateSnapshot: Record<string, unknown>;
      createdAt: Date;
      updatedAt: Date;
    }
  >();

  private isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  /**
   * 1. Obtener historial: Devuelve el documento de chat completo filtrado por projectId.
   */
  async getChatHistory(projectId: string): Promise<IChatRoom> {
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('El projectId es obligatorio');
    }

    const key = projectId.trim();

    if (this.isConnected()) {
      try {
        let room = await ChatRoom.findOne({ projectId: key });
        if (!room) {
          room = await ChatRoom.create({
            projectId: key,
            messages: [],
            canvasStateSnapshot: {},
          });
        }
        return room;
      } catch (err) {
        this.logger.warn(
          `No se pudo leer de MongoDB (${(err as Error).message}), usando respaldo en memoria.`,
        );
      }
    }

    // Respaldo en memoria
    if (!this.inMemoryRooms.has(key)) {
      this.inMemoryRooms.set(key, {
        projectId: key,
        messages: [],
        canvasStateSnapshot: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return this.inMemoryRooms.get(key) as unknown as IChatRoom;
  }

  /**
   * 2. Añadir mensaje: Agrega ($push) un mensaje al array de mensajes de la sala.
   */
  async addMessage(
    projectId: string,
    dto: AddMessageDto,
    fallbackUser?: { id: string; name: string },
  ): Promise<IChatRoom> {
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('El projectId es obligatorio');
    }

    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException('El contenido del mensaje no puede estar vacío');
    }

    const senderId = dto.senderId?.trim() || fallbackUser?.id || 'anonymous';
    const senderName = dto.senderName?.trim() || fallbackUser?.name || 'Usuario';
    const key = projectId.trim();

    const newMessage = {
      senderId,
      senderName,
      content,
      timestamp: new Date(),
    };

    if (this.isConnected()) {
      try {
        const updatedRoom = await ChatRoom.findOneAndUpdate(
          { projectId: key },
          {
            $push: { messages: newMessage },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        );
        if (updatedRoom) return updatedRoom;
      } catch (err) {
        this.logger.warn(
          `No se pudo guardar mensaje en MongoDB (${(err as Error).message}), usando respaldo en memoria.`,
        );
      }
    }

    // Respaldo en memoria
    let memRoom = this.inMemoryRooms.get(key);
    if (!memRoom) {
      memRoom = {
        projectId: key,
        messages: [],
        canvasStateSnapshot: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.inMemoryRooms.set(key, memRoom);
    }
    memRoom.messages.push(newMessage);
    memRoom.updatedAt = new Date();
    return memRoom as unknown as IChatRoom;
  }

  /**
   * 3. Guardar estado del canvas: Actualiza canvasStateSnapshot con el estado dinámico del diagrama.
   */
  async saveCanvasSnapshot(
    projectId: string,
    dto: SaveCanvasDto,
  ): Promise<IChatRoom> {
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('El projectId es obligatorio');
    }

    const key = projectId.trim();
    const snapshot =
      dto.canvasStateSnapshot ||
      (dto.nodes || dto.edges ? { nodes: dto.nodes, edges: dto.edges } : {});

    if (this.isConnected()) {
      try {
        const updatedRoom = await ChatRoom.findOneAndUpdate(
          { projectId: key },
          {
            $set: { canvasStateSnapshot: snapshot },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        );
        if (updatedRoom) return updatedRoom;
      } catch (err) {
        this.logger.warn(
          `No se pudo guardar snapshot en MongoDB (${(err as Error).message}), usando respaldo en memoria.`,
        );
      }
    }

    // Respaldo en memoria
    let memRoom = this.inMemoryRooms.get(key);
    if (!memRoom) {
      memRoom = {
        projectId: key,
        messages: [],
        canvasStateSnapshot: snapshot,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.inMemoryRooms.set(key, memRoom);
    } else {
      memRoom.canvasStateSnapshot = snapshot;
      memRoom.updatedAt = new Date();
    }
    return memRoom as unknown as IChatRoom;
  }
}
