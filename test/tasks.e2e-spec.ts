import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '#services/api/src/app.module.js';
import { configureApp } from '#services/api/src/bootstrap.js';
import { httpServer } from './support/http-server.js';

/**
 * Covers the public read path and proves the mutation routes fail closed. The
 * authenticated write path needs a real JWKS issuer (AUTH_CONFIG) — see
 * src/tasks/tasks.service.spec.ts for the create/update/remove logic tested in
 * isolation, and README.md for wiring a real auth provider.
 */
describe('Tasks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /tasks returns a list', async () => {
    const res = await request(httpServer(app)).get('/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /tasks/:id returns 404 for an unknown id', async () => {
    const res = await request(httpServer(app)).get(
      '/tasks/01ARZ3NDEKTSV4RRFFQ69G5FAV',
    );
    expect(res.status).toBe(404);
  });

  it('POST /tasks without a bearer token is rejected', async () => {
    const res = await request(httpServer(app))
      .post('/tasks')
      .send({ title: 'Write the README' });
    expect(res.status).toBe(401);
  });

  it('POST /tasks with a bogus bearer token is rejected', async () => {
    const res = await request(httpServer(app))
      .post('/tasks')
      .set('authorization', 'Bearer not-a-real-token')
      .send({ title: 'Write the README' });
    expect(res.status).toBe(401);
  });
});
