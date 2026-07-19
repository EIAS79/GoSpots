import { IsString, Length } from 'class-validator';

export class ActivateStaffDto {
  @IsString()
  @Length(32, 128)
  token!: string;

  @IsString()
  @Length(10, 128)
  password!: string;
}
