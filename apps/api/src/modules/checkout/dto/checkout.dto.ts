import { IsInt, IsOptional, Min } from 'class-validator';

export class PreviewCheckoutDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class CreateCheckSettlementDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
