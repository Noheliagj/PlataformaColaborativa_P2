import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import mongoose from 'mongoose';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('etag', false);

  // Configuración de conexión NoSQL a MongoDB vía Mongoose
  // Desactivamos el buffer de comandos para evitar que se congele 10s cuando Mongo esté apagado
  mongoose.set('bufferCommands', false);
  const mongoUri =
    process.env.MONGO_URI ?? 'mongodb://localhost:27017/examen_sw1_nosql';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
    logger.log(`[MongoDB] Conectado exitosamente a: ${mongoUri}`);
  } catch (err) {
    logger.warn(
      `[MongoDB] Advertencia: No se pudo conectar a ${mongoUri} (${(err as Error).message}). El servidor continuará operando.`,
    );
  }

  // Permite que el frontend web (Vite dev server) consuma la API.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
