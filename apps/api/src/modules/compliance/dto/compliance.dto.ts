import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
