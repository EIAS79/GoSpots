import { IsIn, IsOptional, IsString } from "class-validator";
import { NOTIFICATION_SECTIONS } from "../../../common/notification.constants";

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn([...NOTIFICATION_SECTIONS, "all"])
  section?: string;

  /** all | unread | read | archived */
  @IsOptional()
  @IsString()
  @IsIn(["all", "unread", "read", "archived"])
  status?: string;

  @IsOptional()
  @IsString()
  take?: string;

  @IsOptional()
  @IsString()
  skip?: string;

  @IsOptional()
  @IsString()
  since?: string;
}
