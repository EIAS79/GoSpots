import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class DeleteAuditDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  allMatching?: boolean;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
