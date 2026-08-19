import { IsOptional, IsString, Matches } from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class DeterministicInsightsDto {
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
