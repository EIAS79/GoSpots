import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateGalleryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
