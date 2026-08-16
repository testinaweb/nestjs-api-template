import { Injectable, Logger } from '@nestjs/common';

export enum LogLevel {
  LOG = 'log',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
  QUERY = 'query',
}

export type LogLevels = LogLevel[];
export const LOG_LEVEL_KEY = `log-level-${process.env.NODE_ENV || 'test'}`;

@Injectable()
export class DynamicLogLevel {
  private readonly logger = new Logger(DynamicLogLevel.name);
  private currentLogLevel: LogLevels | null = null;
  private setLevelCallback: ((levels: LogLevels) => void) | null = null;

  constructor() {
    this.logger.log('DynamicLogLevel instance created');
  }

  public init(setLevel: (a: LogLevels) => void): void {
    this.setLevelCallback = setLevel;
    this.logger.log('Initialising DynamicLogLevel');
    this.setInitialLogLevel(setLevel);
  }

  public getDefaultLogLevel(): LogLevels {
    this.logger.debug('Getting default log level');
    return process.env.NODE_ENV === 'production'
      ? [LogLevel.LOG, LogLevel.WARN, LogLevel.ERROR]
      : [
          LogLevel.QUERY,
          LogLevel.DEBUG,
          LogLevel.LOG,
          LogLevel.WARN,
          LogLevel.ERROR,
        ];
  }

  public setLogLevelGlobally(logLevel: LogLevels): void {
    if (!Array.isArray(logLevel)) {
      this.logger.error(`Log level has to be an array: ${String(logLevel)}`);
      throw new Error(`Log level has to be an array: ${String(logLevel)}`);
    }
    if (!this.validLogLevels(logLevel)) {
      this.logger.error(`Invalid log level: ${String(logLevel)}`);
      throw new Error(`Invalid log level: ${String(logLevel)}`);
    }
    this.logger.log(`Setting log level to: ${String(logLevel)}`);
    this.persistLogLevel(logLevel);
    this.setLevelCallback?.(logLevel);
  }

  public getLogLevel(): LogLevels {
    if (this.currentLogLevel !== null) {
      return this.currentLogLevel;
    }
    return this.getDefaultLogLevel();
  }

  public validLogLevels(logLevel: LogLevels): boolean {
    return logLevel.every((level) => Object.values(LogLevel).includes(level));
  }

  public setInitialLogLevel(setLevel: (a: LogLevels) => void): void {
    const logLevel = this.getLogLevel();
    setLevel(logLevel);
  }

  public persistLogLevel(logLevel: LogLevels): void {
    this.currentLogLevel = logLevel;
  }
}
