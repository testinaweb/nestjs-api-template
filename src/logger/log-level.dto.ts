import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, Min } from 'class-validator';
import type { LogLevels } from './dynamic-log-level.service.js';

export class SetLogLevelDto {
  @ApiProperty({ description: 'Array of log levels to activate' })
  @IsArray()
  logLevel!: LogLevels;

  @ApiPropertyOptional({
    description: 'Time to live in seconds before reverting to nextLogLevel',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  TTL?: number;

  @ApiPropertyOptional({
    description: 'Log level to revert to after TTL expires',
  })
  @IsOptional()
  @IsArray()
  nextLogLevel?: LogLevels;
}
