import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { NOTIFICATION_SECTIONS } from '../../../common/notification.constants';

export class ArchiveNotificationsDto {
  /** Archive specific rows (checkbox selection) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  /** Archive everything matching filter (select all in view) */
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
  @IsIn([...NOTIFICATION_SECTIONS, 'all'])
  section?: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'unread', 'read', 'archived'])
  status?: string;
}
