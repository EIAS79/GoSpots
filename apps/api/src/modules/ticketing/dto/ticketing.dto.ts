import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTicketProductDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(64) sku?: string;
  @IsInt() @Min(0) priceMinor!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(525600) validityMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxScans?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class TicketIssueLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) @Max(100) quantity!: number;
}

export class IssueTicketOrderDto {
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TicketIssueLineDto)
  lines!: TicketIssueLineDto[];
  @IsOptional() @IsString() customerRef?: string;
}

export class ScanTicketDto {
  @IsString() @MaxLength(512) token!: string;
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(120) scannerDeviceId?: string;
}

export class CreateRfidWalletDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsString() customerRef?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class BindRfidCredentialDto {
  @IsString() @MaxLength(512) uid!: string;
  @IsString() walletId!: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class RfidWalletMutationDto {
  @IsInt() @Min(1) amountMinor!: number;
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(80) referenceType?: string;
  @IsOptional() @IsString() @MaxLength(160) referenceId?: string;
  @IsOptional() @IsString() @MaxLength(240) note?: string;
}

export class ReverseRfidEntryDto {
  @IsString() entryId!: string;
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(240) note?: string;
}

export class RfidTapDto {
  @IsString() @MaxLength(512) uid!: string;
  @IsIn(['IDENTIFY', 'BALANCE', 'SPEND', 'LOAD']) action!:
    | 'IDENTIFY'
    | 'BALANCE'
    | 'SPEND'
    | 'LOAD';
  @IsOptional() @IsInt() @Min(1) amountMinor?: number;
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(120) deviceId?: string;
}
