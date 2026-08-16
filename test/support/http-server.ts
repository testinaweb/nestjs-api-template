import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';

/** app.getHttpServer() is typed `any` in Nest; this gives supertest a real type. */
export function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
