import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS: Angular (localhost:4200) y Flutter web (puerto variable
  // asignado por `flutter run -d chrome`), ambos en localhost/127.0.0.1.
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === (process.env.FRONTEND_URL ?? 'http://localhost:4200') ||
        /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido por CORS.'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Prefijo global para todas las rutas: /api/auth/*, /api/users/*
  app.setGlobalPrefix('api');

  // Validación automática de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // elimina campos no declarados en el DTO
      forbidNonWhitelisted: true, // lanza error si hay campos extra
      transform: true,           // convierte tipos automáticamente
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 NestJS corriendo en: http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();

