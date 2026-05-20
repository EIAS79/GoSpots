import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { ShopService } from "../shop/shop.service";

@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(private readonly shop: ShopService) {}

  @Public()
  @Get("venues")
  venues() {
    return this.shop.listPublicVenues();
  }

  @Public()
  @Get("venues/:slug")
  venue(@Param("slug") slug: string) {
    return this.shop.getPublicVenue(slug);
  }
}
