import { PrintIncidentOutcome } from '@prisma/client';
import {
  IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString,
  Length, MaxLength, Min,
} from 'class-validator';

export class IncidentMutationDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;

  @IsString()
  @Length(8, 1000)
  reason!: string;
}

export class IncidentEvidenceDto extends IncidentMutationDto {
  @IsIn(['VISUAL_INSPECTION', 'PRINTER_STATUS', 'EDGE_JOURNAL', 'OPERATOR_REPORT'])
  method!: string;

  @IsString()
  @Length(3, 200)
  reference!: string;

  @IsISO8601({ strict: true })
  observedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class IncidentDecisionDto extends IncidentMutationDto {
  @IsEnum(PrintIncidentOutcome)
  physicalOutcome!: PrintIncidentOutcome;
}
