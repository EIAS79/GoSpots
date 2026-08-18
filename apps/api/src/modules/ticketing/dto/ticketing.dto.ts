import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTicketProductDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() menuItemId!: string;
  @IsOptional() @IsString() @MaxLength(64) sku?: string;
  @IsOptional() @IsInt() @Min(1) @Max(525600) validityMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxScans?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class IssueTicketOrderDto {
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsString() settlementId!: string;
}

export class TicketMutationDto {
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsString() @MaxLength(240) reason!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class CreateAccessZoneDto {
  @IsString() @MaxLength(48) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) zoneType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) capacity?: number;
}

export class CreateAccessRuleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsIn(['ALLOW', 'DENY']) effect?: 'ALLOW' | 'DENY';
  @IsOptional() @IsString() ticketProductId?: string;
  @IsOptional() @IsString() membershipTierId?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxVisits?: number;
}

export class ConfigureAccessScannerDto {
  @IsString() zoneId!: string;
  @IsOptional() @IsBoolean() allowOfflineCache?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(86400) offlineCacheTtlSeconds?: number;
  @IsOptional() @IsBoolean() enforceSequence?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class BindAccessCredentialDto {
  @IsString() @MaxLength(512) token!: string;
  @IsIn(['RFID', 'NFC', 'WRISTBAND', 'MEMBERSHIP'])
  type!: 'RFID' | 'NFC' | 'WRISTBAND' | 'MEMBERSHIP';
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() membershipId?: string;
  @IsOptional() @IsString() storedValueAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) visitLimit?: number;
  @IsOptional() @IsString() expiresAt?: string;
}

export class AccessScanDto {
  @IsString() @MaxLength(512) token!: string;
  @IsString() zoneId!: string;
  @IsIn(['ENTER', 'EXIT', 'VERIFY']) direction!: 'ENTER' | 'EXIT' | 'VERIFY';
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() scannerDeviceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) deviceSequence?: number;
  @IsOptional() @IsBoolean() offlineReplay?: boolean;
  @IsOptional() @IsString() occurredAt?: string;
}

export class OccupancyCorrectionDto {
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) targetOccupancy!: number;
  @IsString() @MaxLength(240) reason!: string;
}

export class StoredValueCredentialDto {
  @IsString() @MaxLength(512) token!: string;
  @IsIn(['BALANCE', 'SPEND', 'LOAD']) action!: 'BALANCE' | 'SPEND' | 'LOAD';
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amountMinor?: number;
  @IsOptional() @IsString() paymentId?: string;
  @IsOptional() @IsString() @MaxLength(240) note?: string;
}

export class CreateLockerDto {
  @IsString() @MaxLength(64) code!: string;
  @IsOptional() @IsString() @MaxLength(80) sizeType?: string;
  @IsOptional() @IsString() rentalMenuItemId?: string;
  @IsOptional() @IsString() depositMenuItemId?: string;
}

export class AssignLockerDto {
  @IsString() credentialId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() ticketId?: string;
  @IsOptional() @IsString() settlementId?: string;
  @IsString() @MaxLength(128) idempotencyKey!: string;
}

export class LockerEventDto {
  @IsIn(['OPENED', 'CLOSED', 'MANUAL_OVERRIDE'])
  type!: 'OPENED' | 'CLOSED' | 'MANUAL_OVERRIDE';
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
}

export class ReleaseLockerDto {
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}
