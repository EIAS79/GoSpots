import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfigureComplianceProfileDto {
  @IsString() @MaxLength(240)
  legalName!: string;
  @IsString() @Matches(/^\d{10}$/)
  taxId!: string;
  @IsString() @MaxLength(240)
  streetAddress!: string;
  @IsString() @Matches(/^\d{2}-\d{3}$/)
  postalCode!: string;
  @IsString() @MaxLength(120)
  city!: string;
  @IsOptional() @IsString() @MaxLength(40)
  defaultTaxCategoryCode?: string;
  @IsOptional() @IsIn(['TEST', 'DEMO', 'PRD'])
  ksefEnvironment?: 'TEST' | 'DEMO' | 'PRD';
  @IsOptional() @IsString() @MaxLength(2048)
  ksefToken?: string;
}

export class UpsertTaxCategoryDto {
  @IsString() @MaxLength(40)
  code!: string;
  @IsString() @MaxLength(120)
  label!: string;
  @IsString() @Matches(/^\d{1,3}(?:\.\d{1,4})?$/)
  ratePercent!: string;
  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpsertFiscalDeviceDto {
  @IsString() @MaxLength(120)
  label!: string;
  @IsString() @MaxLength(80)
  provider!: string;
  @IsOptional() @IsString() @MaxLength(200)
  externalDeviceId?: string;
  @IsOptional() @IsBoolean()
  enabled?: boolean;
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class GenerateSettlementComplianceDocumentDto {
  @IsIn(['RECEIPT', 'INVOICE'])
  kind!: 'RECEIPT' | 'INVOICE';
  @IsOptional() @IsString() @MaxLength(240)
  buyerName?: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/)
  buyerTaxId?: string;
}

export class FiscalizeReceiptDto {
  @IsString() @MaxLength(160)
  fiscalDeviceId!: string;
}

export class CreateComplianceDocumentDto {
  @IsIn(['RECEIPT', 'INVOICE', 'CORRECTION', 'REFUND'])
  kind!: 'RECEIPT' | 'INVOICE' | 'CORRECTION' | 'REFUND';
  @IsString() @MaxLength(80)
  sourceType!: string;
  @IsString() @MaxLength(160)
  sourceId!: string;
  @IsOptional() @IsInt() @Min(1)
  sourceVersion?: number;
  @IsOptional() @IsString() @MaxLength(160)
  parentDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(160)
  documentNumber?: string;
  @IsDateString()
  issueDate!: string;
  @IsString() @MaxLength(3)
  currency!: string;
  @IsString() @MaxLength(40)
  netAmount!: string;
  @IsString() @MaxLength(40)
  taxAmount!: string;
  @IsString() @MaxLength(40)
  grossAmount!: string;
  @IsOptional() @IsObject()
  taxSummary?: Record<string, unknown>;
  @IsOptional() @IsString()
  payloadXml?: string;
}

export class AddComplianceProofDto {
  @IsIn(['KSEF_REFERENCE', 'KSEF_NUMBER', 'UPO', 'FISCAL_RECEIPT', 'OTHER'])
  type!: 'KSEF_REFERENCE' | 'KSEF_NUMBER' | 'UPO' | 'FISCAL_RECEIPT' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(200)
  externalReference?: string;
  @IsString()
  content!: string;
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
