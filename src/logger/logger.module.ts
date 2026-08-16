import { Module } from '@nestjs/common';
import { CustomLogger } from './custom-logger.service.js';
import { DynamicLogLevel } from './dynamic-log-level.service.js';
import { LogLevelController } from './log-level.controller.js';

@Module({
  providers: [CustomLogger, DynamicLogLevel],
  exports: [CustomLogger, DynamicLogLevel],
  controllers: [LogLevelController],
})
export class LoggerModule {}
