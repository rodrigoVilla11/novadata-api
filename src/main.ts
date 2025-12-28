import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const allowlist = [
    'http://localhost:3001',
    'https://novadata-hbasdoz71-rodrigo-villarreals-projects.vercel.app',
    'https://novadata.vercel.app', // si después usás dominio fijo
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // permite Postman/curl (sin origin) y permite los de la lista
      if (!origin || allowlist.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
