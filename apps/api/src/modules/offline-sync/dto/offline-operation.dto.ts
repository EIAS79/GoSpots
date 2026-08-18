import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Operations handled by the original Offline Lite replay service. */
export const OFFLINE_OPERATION_TYPES = [
  'CHECK_CREATE',
  'CHECK_UPDATE',
  'ORDER_CREATE',
  'SESSION_START',
  'SESSION_END',
] as const;

/** Phase 12 adds Edge-certified operations without widening legacy handler dispatch. */
export const EDGE_OFFLINE_OPERATION_TYPES = [
  ...OFFLINE_OPERATION_TYPES,
  'SESSION_PAUSE',
  'SESSION_RESUME',
  'CASH_PAYMENT',
] as const;

export type OfflineOperationType = (typeof OFFLINE_OPERATION_TYPES)[number];

export class ApplyOfflineOperationDto {
  /** Stable local mutation ID. Reusing it with different content is a conflict. */
  @IsUUID()
  operationId!: string;

  /** LAN client/device that originated the mutation. */
  @IsString()
  @MaxLength(120)
  deviceId!: string;

  /** Informational client venue; server context remains authoritative. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueId?: string;

  /** Monotonic per-device local sequence. Optional for pre-Phase-12 clients. */
  @IsOptional()
  @IsInt()
  @Min(1)
  localSequence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @IsIn(EDGE_OFFLINE_OPERATION_TYPES)
  operationType!: OfflineOperationType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aggregateType?: string;

  /** Client-addressed aggregate or existing aggregate ID. */
  @IsString()
  @MaxLength(160)
  entityId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  correlationId?: string;

  @IsString()
  @MaxLength(64)
  payloadHash!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
