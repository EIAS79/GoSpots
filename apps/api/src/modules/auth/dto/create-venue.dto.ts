import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { VENUE_ADD_ONS, VENUE_PACKS } from '../../../common/venue-packs';

const PACK_IDS = Object.keys(VENUE_PACKS);
const ADD_ON_IDS = Object.keys(VENUE_ADD_ONS);

export class CreateVenueDto {
  @IsString()
  @MaxLength(120)
  shopName!: string;

  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/i, { message: 'Slug must be alphanumeric/dash.' })
  shopSlug!: string;

  @IsOptional()
  @IsString()
  @IsIn([...PACK_IDS])
  packId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsIn([...ADD_ON_IDS], { each: true })
  addOns?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  venueType?: string;
}
