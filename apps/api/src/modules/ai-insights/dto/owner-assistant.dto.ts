import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class OwnerAssistantQuestionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @IsString()
  @Matches(DATE_KEY)
  fromDate!: string;

  @IsString()
  @Matches(DATE_KEY)
  toDate!: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_KEY)
  compareFromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_KEY)
  compareToDate?: string;
}
