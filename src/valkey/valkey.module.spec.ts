import type { ConfigService } from '@nestjs/config';
import type { ValkeyConfig } from '#src/config/configuration.js';

const redisConstructor = jest.fn();

// Capture the options ioredis is constructed with, without opening a real connection.
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((options: unknown) => {
    redisConstructor(options);
    return { quit: jest.fn().mockResolvedValue(undefined) };
  }),
}));

// The provider factory is defined inline in the module; re-import after mocking ioredis.
import { ValkeyModule } from './valkey.module.js';
import { VALKEY_CLIENT } from './valkey.constants.js';

type Factory = (config: ConfigService) => unknown;

/** Pull the VALKEY_CLIENT provider's useFactory out of the module metadata. */
function valkeyFactory(): Factory {
  const providers = Reflect.getMetadata('providers', ValkeyModule) as Array<{
    provide: unknown;
    useFactory?: Factory;
  }>;
  const provider = providers.find((p) => p.provide === VALKEY_CLIENT);
  if (!provider?.useFactory) throw new Error('VALKEY_CLIENT factory not found');
  return provider.useFactory;
}

function makeConfig(valkey: ValkeyConfig): ConfigService {
  return {
    getOrThrow: jest.fn(() => valkey),
  } as unknown as ConfigService;
}

describe('ValkeyModule client factory', () => {
  beforeEach(() => redisConstructor.mockClear());

  it('enables TLS when the config requests it (ElastiCache serverless/prod)', () => {
    valkeyFactory()(
      makeConfig({ host: 'cache.example', port: 6379, tls: true }),
    );
    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'cache.example', port: 6379, tls: {} }),
    );
  });

  it('leaves TLS off for a plaintext local/docker Valkey', () => {
    valkeyFactory()(makeConfig({ host: 'localhost', port: 6379, tls: false }));
    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', tls: undefined }),
    );
  });

  it('defaults TLS off when the config omits the flag', () => {
    valkeyFactory()(makeConfig({ host: 'localhost', port: 6379 }));
    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ tls: undefined }),
    );
  });
});
