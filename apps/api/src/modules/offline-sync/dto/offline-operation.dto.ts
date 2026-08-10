import {
  IsIn,
  IsInt,
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
] as const;

export type OfflineOperationType = (typeof OFFLINE_OPERATION_TYPES)[number];

export class ApplyOfflineOperationDto {
  @IsUUID()
  operationId!: string;

  @IsString()
  @MaxLength(120)
  deviceId!: string;

  @IsIn(OFFLINE_OPERATION_TYPES)
  operationType!: OfflineOperationType;

  @IsString()
  @MaxLength(160)
  entityId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsString()
  @MaxLength(64)
  payloadHash!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
