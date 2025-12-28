import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookies (refresh token, etc.)
  app.use(cookieParser());

  // ✅ OPCIÓN B: aceptar cualquier origin (pero devolviendo el origin exacto),
  // compatible con cookies/credentials.
  app.enableCors({
    origin: (origin, callback) => {
      // Permite requests sin Origin (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Acepta cualquier origin
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
