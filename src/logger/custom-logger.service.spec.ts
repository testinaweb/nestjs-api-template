import { requestContextStorage } from '#src/common/request-context.js';
import { CustomLogger } from './custom-logger.service.js';

describe('CustomLogger', () => {
  let output: string;
  let writeSpy: jest.SpiedFunction<typeof process.stdout.write>;

  beforeEach(() => {
    output = '';
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        output += String(chunk);
        return true;
      });
    delete process.env.LOG_JSON_FORMAT;
    process.env.NO_COLOR = 'true';
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('includes the request id from AsyncLocalStorage in text mode', () => {
    const logger = new CustomLogger('Test');
    requestContextStorage.run({ requestId: 'req-abc' }, () => {
      logger.log('hello');
    });
    expect(output).toContain('[req:req-abc]');
    expect(output).toContain('hello');
  });

  it('omits the request id tag when there is no request context', () => {
    const logger = new CustomLogger('Test');
    logger.log('hello');
    expect(output).not.toContain('[req:');
  });

  it('emits one JSON object per line when LOG_JSON_FORMAT=true', () => {
    process.env.LOG_JSON_FORMAT = 'true';
    const logger = new CustomLogger('Test');
    requestContextStorage.run({ requestId: 'req-json' }, () => {
      logger.log('hello json');
    });

    const entry = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'LOG',
      context: 'Test',
      requestId: 'req-json',
      message: 'hello json',
    });
    expect(typeof entry.timestamp).toBe('string');
    expect(typeof entry.pid).toBe('number');
  });

  it('JSON mode omits requestId when there is no request context', () => {
    process.env.LOG_JSON_FORMAT = 'true';
    const logger = new CustomLogger('Test');
    logger.log('no context');

    const entry = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(entry).not.toHaveProperty('requestId');
  });
});
