import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod, TransactionKind } from "@prisma/client";

export class LineItemDto {
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateTransactionDto {
  @IsEnum(TransactionKind)
  kind!: TransactionKind;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lines!: LineItemDto[];
}

export class CreateLossDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
