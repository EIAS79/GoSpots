import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const NOTE_IMPORTANCE = [
  'INFO',
  'NORMAL',
  'IMPORTANT',
  'URGENT',
] as const;

export type NoteImportanceValue = (typeof NOTE_IMPORTANCE)[number];

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsIn(NOTE_IMPORTANCE)
  importance?: NoteImportanceValue;

  /** Shift day/time this note is about (ISO). Defaults to now. */
  @IsOptional()
  @IsDateString()
  relevantAt?: string;

  /** Display name for who posted (defaults to account name). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  authorName?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsIn(NOTE_IMPORTANCE)
  importance?: NoteImportanceValue;

  @IsOptional()
  @IsDateString()
  relevantAt?: string;
}
