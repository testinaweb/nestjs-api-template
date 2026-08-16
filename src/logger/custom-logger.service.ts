import { ConsoleLogger, Injectable, LogLevel, Optional } from '@nestjs/common';
import type { ConsoleLoggerOptions } from '@nestjs/common';
import { getRequestId } from '#src/common/request-context.js';
import { DynamicLogLevel } from './dynamic-log-level.service.js';

@Injectable()
export class CustomLogger extends ConsoleLogger {
  constructor(
    @Optional() context?: string,
    @Optional() options?: ConsoleLoggerOptions,
    @Optional() private dynamicLogLevel?: DynamicLogLevel,
  ) {
    super(context ?? '', options ?? {});
    // Cast is intentional: our LogLevels (string enum) and NestJS's LogLevel (string union) are
    // structurally equivalent at runtime. The callback bridges the two type worlds.
    void dynamicLogLevel?.init((levels) =>
      this.setLogLevels(levels as LogLevel[]),
    );
  }

  /**
   * Custom log level 'query' for TypeORM query logging.
   * Uses internal ConsoleLogger methods not exposed in the public API —
   * kept intentional as this is a private extension of the base logger.
   */

  public query(message: unknown, ...optionalParams: unknown[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const logger = this as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (!logger.isLevelEnabled('query')) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const { messages, context } = logger.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    logger.printMessages(messages, context, 'query');
  }

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    messages.forEach((message) => {
      const pidMessage = this.formatPid(process.pid);
      const contextMessage = this.formatContext(context ?? '');
      const timestampDiff = this.updateAndGetTimestampDiff();
      const level = logLevel ?? 'log';
      const formattedLogLevel = level.toUpperCase();
      const formattedMessage = this.formatMessage(
        level,
        message,
        pidMessage,
        formattedLogLevel,
        contextMessage,
        timestampDiff,
      );
      process[writeStreamType ?? 'stdout'].write(formattedMessage);
    });
  }

  protected formatPid(pid: number): string {
    return `PID: ${pid} - `;
  }

  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    if (this.isJsonFormat()) {
      return this.formatJsonMessage(message, formattedLogLevel, contextMessage);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const output = this.stringifyMessage(message, logLevel);
    const requestIdMessage = this.formatRequestId();
    if (this.isColorAllowed()) {
      const coloredPid = this.colorize(pidMessage, logLevel);
      const coloredLevel = this.colorize(formattedLogLevel, logLevel);
      return `${coloredPid}${this.getTimestamp()} ${coloredLevel} ${contextMessage}${requestIdMessage}${output}${timestampDiff}\n`;
    }
    return `${formattedLogLevel} ${contextMessage}${requestIdMessage}${output}${timestampDiff}\n`;
  }

  /** One JSON object per line — set LOG_JSON_FORMAT=true for log aggregators (CloudWatch, etc). */
  private formatJsonMessage(
    message: unknown,
    formattedLogLevel: string,
    contextMessage: string,
  ): string {
    const context = contextMessage.trim().replace(/^\[|\]$/g, '');
    const requestId = getRequestId();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: formattedLogLevel,
      pid: process.pid,
      message: this.toLoggableValue(message),
    };
    if (context) entry.context = context;
    if (requestId) entry.requestId = requestId;
    return `${JSON.stringify(entry)}\n`;
  }

  private toLoggableValue(message: unknown): unknown {
    if (message instanceof Error) {
      return {
        name: message.name,
        message: message.message,
        stack: message.stack,
      };
    }
    if (typeof message === 'string') return message;
    try {
      JSON.stringify(message);
      return message;
    } catch {
      return String(message);
    }
  }

  private formatRequestId(): string {
    const requestId = getRequestId();
    return requestId ? `[req:${requestId}] ` : '';
  }

  private isJsonFormat(): boolean {
    return process.env.LOG_JSON_FORMAT === 'true';
  }

  private isColorAllowed(): boolean {
    return !process.env.NO_COLOR;
  }
}
