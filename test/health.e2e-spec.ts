import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '#services/api/src/app.module.js';
import { configureApp } from '#services/api/src/bootstrap.js';
import { httpServer } from './support/http-server.js';

interface HelloBody {
  name: string;
  status: string;
  commitSha: string;
}

describe('Health (e2e)', () => {
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

  it('GET / returns the app name and ok status', async () => {
    const res = await request(httpServer(app)).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    const body = res.body as HelloBody;
    expect(typeof body.name).toBe('string');
    expect(typeof body.commitSha).toBe('string');
  });

  it('GET /health returns ok', async () => {
    const res = await request(httpServer(app)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready reports database and valkey as up', async () => {
    const res = await request(httpServer(app)).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: { database: 'up', valkey: 'up' },
    });
  });

  it('every response carries an x-request-id header', async () => {
    const res = await request(httpServer(app)).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
