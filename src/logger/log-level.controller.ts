import { Body, Controller, Get, Inject, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DynamicLogLevel } from './dynamic-log-level.service.js';
import type { LogLevels } from './dynamic-log-level.service.js';
import { SetLogLevelDto } from './log-level.dto.js';

@ApiTags('logging-management')
@Controller('log-level')
export class LogLevelController {
  private readonly logger = new Logger(LogLevelController.name);

  constructor(
    @Inject(DynamicLogLevel) private dynamicLogLevel: DynamicLogLevel,
  ) {}

  @Get()
  getLogLevel(): LogLevels {
    this.logger.debug('Getting log level');
    return this.dynamicLogLevel.getLogLevel();
  }

  @Post()
  setLogLevel(@Body() body: SetLogLevelDto): void {
    if (body.TTL) {
      this.logger.debug(`Setting TTL: ${body.TTL} seconds`);
      const nextLogLevel =
        body.nextLogLevel ?? this.dynamicLogLevel.getLogLevel();
      setTimeout(() => {
        this.logger.debug(
          `TTL expired, Setting log level: ${JSON.stringify(nextLogLevel)}`,
        );
        this.dynamicLogLevel.setLogLevelGlobally(nextLogLevel);
      }, body.TTL * 1000);
    }
    this.logger.debug(`Setting log level: ${JSON.stringify(body.logLevel)}`);
    this.dynamicLogLevel.setLogLevelGlobally(body.logLevel);
  }
}
