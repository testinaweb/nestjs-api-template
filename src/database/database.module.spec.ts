import type { PostgresConfig } from '#src/config/configuration.js';
import { buildTypeOrmOptions } from './database.module.js';

describe('buildTypeOrmOptions', () => {
  const base: PostgresConfig = {
    host: 'writer.example.com',
    port: 5432,
    username: 'app',
    password: 'secret',
    database: 'app',
    ssl: false,
  };

  it('routes the slave to the same host as the master when readonlyHost is unset', () => {
    const options = buildTypeOrmOptions(base);
    expect(options.replication.master.host).toBe('writer.example.com');
    expect(options.replication.slaves).toEqual([
      expect.objectContaining({ host: 'writer.example.com' }),
    ]);
  });

  it('routes the slave to the same host as the master when readonlyHost is empty', () => {
    const options = buildTypeOrmOptions({ ...base, readonlyHost: '' });
    expect(options.replication.slaves[0].host).toBe('writer.example.com');
  });

  it('routes the slave to readonlyHost when set', () => {
    const options = buildTypeOrmOptions({
      ...base,
      readonlyHost: 'reader.example.com',
    });
    expect(options.replication.master.host).toBe('writer.example.com');
    expect(options.replication.slaves[0].host).toBe('reader.example.com');
  });

  it('shares the same credentials on master and slave', () => {
    const options = buildTypeOrmOptions({
      ...base,
      readonlyHost: 'reader.example.com',
    });
    expect(options.replication.master).toMatchObject({
      port: 5432,
      username: 'app',
      password: 'secret',
      database: 'app',
    });
    expect(options.replication.slaves[0]).toMatchObject({
      port: 5432,
      username: 'app',
      password: 'secret',
      database: 'app',
    });
  });

  it('maps ssl:true to rejectUnauthorized:false on both master and slave', () => {
    const options = buildTypeOrmOptions({ ...base, ssl: true });
    expect(options.replication.master.ssl).toEqual({
      rejectUnauthorized: false,
    });
    expect(options.replication.slaves[0].ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('maps ssl:false to false on both master and slave', () => {
    const options = buildTypeOrmOptions(base);
    expect(options.replication.master.ssl).toBe(false);
    expect(options.replication.slaves[0].ssl).toBe(false);
  });
});
