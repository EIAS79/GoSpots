import { KsefSpecialMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterKsefSpecialModeDto {
  @IsEnum(KsefSpecialMode)
  mode!: KsefSpecialMode;

  @IsISO8601()
  issuedAt!: string;

  @IsOptional()
  @IsISO8601()
  submissionDeadlineAt?: string | null;

  @IsOptional()
  @IsISO8601()
  buyerDeliveredAt?: string | null;

  @IsBoolean()
  qrRequiredBeforeSubmit!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  triggeringEventReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  offlineQrPayloadHash?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  offlineCertificateFingerprint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  certificateQrPayloadHash?: string | null;

  @IsString()
  @MaxLength(1000)
  legalBasisNote!: string;
}

export class LinkKsefSpecialModeSubmissionDto {
  @IsString()
  @MaxLength(128)
  complianceRequestId!: string;
}
