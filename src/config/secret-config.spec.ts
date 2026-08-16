import { optionalSecretConfig, requireSecretConfig } from './secret-config.js';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetParameterCommand: jest.fn((input: unknown) => input),
}));

describe('secret-config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TEST_CONFIG;
    sendMock.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the parsed env var without calling Parameter Store', async () => {
    process.env.TEST_CONFIG = '{"host":"localhost"}';
    const result = await requireSecretConfig<{ host: string }>(
      'TEST_CONFIG',
      'test',
    );
    expect(result).toEqual({ host: 'localhost' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws on malformed env var JSON', async () => {
    process.env.TEST_CONFIG = 'not-json';
    await expect(requireSecretConfig('TEST_CONFIG', 'test')).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('throws without calling Parameter Store when NODE_ENV is not staging/production', async () => {
    process.env.NODE_ENV = 'development';
    await expect(requireSecretConfig('TEST_CONFIG', 'test')).rejects.toThrow(
      /Missing config/,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('falls back to Parameter Store when NODE_ENV is staging and the env var is unset', async () => {
    process.env.NODE_ENV = 'staging';
    sendMock.mockResolvedValue({
      Parameter: { Value: '{"host":"ssm-host"}' },
    });
    const result = await requireSecretConfig<{ host: string }>(
      'TEST_CONFIG',
      'test',
    );
    expect(result).toEqual({ host: 'ssm-host' });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('optionalSecretConfig returns null outside staging/production with no env var', async () => {
    process.env.NODE_ENV = 'development';
    await expect(
      optionalSecretConfig('TEST_CONFIG', 'test'),
    ).resolves.toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('optionalSecretConfig returns null when Parameter Store has no value', async () => {
    process.env.NODE_ENV = 'production';
    sendMock.mockResolvedValue({ Parameter: {} });
    await expect(
      optionalSecretConfig('TEST_CONFIG', 'test'),
    ).resolves.toBeNull();
  });

  it('wraps Parameter Store failures with the parameter path', async () => {
    process.env.NODE_ENV = 'production';
    sendMock.mockRejectedValue(new Error('AccessDenied'));
    await expect(requireSecretConfig('TEST_CONFIG', 'test')).rejects.toThrow(
      /\/production\/test/,
    );
  });
});
