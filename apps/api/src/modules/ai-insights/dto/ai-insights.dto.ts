import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RunAiInsightsDto {
  @IsOptional() @IsString() windowStart?: string;
  @IsOptional() @IsString() windowEnd?: string;
  @IsOptional() @IsIn(['AUTO', 'DETERMINISTIC', 'EXTERNAL']) provider?: 'AUTO' | 'DETERMINISTIC' | 'EXTERNAL';
}

export class AiInsightFeedbackDto {
  @IsInt() @Min(-1) @Max(1) rating!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
