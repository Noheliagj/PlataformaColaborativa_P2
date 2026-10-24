import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-payload.interface';
import { NosqlService } from './nosql.service';
import { AddMessageDto } from './dto/add-message.dto';
import { SaveCanvasDto } from './dto/save-canvas.dto';

@UseGuards(JwtAuthGuard)
@Controller('nosql')
export class NosqlController {
  constructor(private readonly nosql: NosqlService) {}

  /**
   * 1. GET /nosql/chat/:projectId
   * Obtener historial completo de mensajes y snapshot del proyecto.
   */
  @Get('chat/:projectId')
  getChatHistory(@Param('projectId') projectId: string) {
    return this.nosql.getChatHistory(projectId);
  }

  /**
   * 2. POST /nosql/chat/:projectId/messages
   * Añadir un mensaje ($push) a la sala del proyecto.
   */
  @Post('chat/:projectId/messages')
  addMessage(
    @Param('projectId') projectId: string,
    @Body() dto: AddMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.nosql.addMessage(projectId, dto, {
      id: user.id,
      name: user.email.split('@')[0],
    });
  }

  /**
   * 3. PUT /nosql/canvas/:projectId
   * Guardar / actualizar el snapshot del canvas en MongoDB.
   */
  @Put('canvas/:projectId')
  saveCanvasSnapshot(
    @Param('projectId') projectId: string,
    @Body() dto: SaveCanvasDto,
  ) {
    return this.nosql.saveCanvasSnapshot(projectId, dto);
  }
}

