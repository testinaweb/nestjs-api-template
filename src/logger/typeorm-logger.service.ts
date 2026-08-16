import { AbstractLogger, LogLevel, LogMessage, LoggerOptions } from 'typeorm';
import { CustomLogger } from './custom-logger.service.js';

export class TypeormLogger extends AbstractLogger {
  constructor(
    private customLogger: CustomLogger,
    options?: LoggerOptions,
  ) {
    // options = boolean | "all" | LogLevel[];
    super(options);
  }

  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | LogMessage[],
  ): void {
    let messageType: string | undefined;
    const messages = this.prepareLogMessages(logMessage, {
      highlightSql: false,
    });
    for (const message of messages) {
      if (this.skipSelect(String(message.message))) {
        return;
      }
      switch (
        (messageType = message.type) !== null && messageType !== void 0
          ? messageType
          : level
      ) {
        case 'log':
        case 'schema-build':
        case 'migration':
          this.customLogger.log(message.message);
          break;
        case 'info':
        case 'query':
          if (message.prefix) {
            this.customLogger.query(`${message.prefix} ${message.message}`);
          } else {
            this.customLogger.query(message.message);
          }
          break;
        case 'warn':
        case 'query-slow':
          if (message.prefix) {
            this.customLogger.warn(`${message.prefix} ${message.message}`);
          } else {
            this.customLogger.warn(message.message);
          }
          break;
        case 'error':
        case 'query-error':
          if (message.prefix) {
            this.customLogger.error(`${message.prefix} ${message.message}`);
          } else {
            this.customLogger.error(message.message);
          }
          break;
      }
    }
  }

  /**
   * Skips trivial SELECT queries that have no FROM clause (e.g. `SELECT 1`).
   */
  private skipSelect(query: string): boolean {
    return (
      query.substring(0, 6).toUpperCase() === 'SELECT' &&
      query.indexOf('FROM') === -1
    );
  }
}
