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

export const OFFLINE_OPERATION_TYPES = [
  'CHECK_CREATE',
  'CHECK_UPDATE',
  'ORDER_CREATE',
  'SESSION_START',
  'SESSION_END',
] as const;

export type OfflineOperationType = (typeof OFFLINE_OPERATION_TYPES)[number];

export class ApplyOfflineOperationDto {
  /** Stable client mutation ID. Reusing it with different content is a conflict. */
  @IsUUID()
  operationId!: string;

  @IsString()
  @MaxLength(120)
  deviceId!: string;

  @IsIn(OFFLINE_OPERATION_TYPES)
  operationType!: OfflineOperationType;

  /** Client-addressed aggregate ID. CREATE operations persist this exact ID. */
  @IsUUID()
  entityId!: string;

  /** Required for versioned update/end operations. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  /** Wall-clock time at which the user performed the local operation. */
  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsString()
  @MaxLength(64)
  payloadHash!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
