import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { ShopService } from "../shop/shop.service";

@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(private readonly shop: ShopService) {}

  @Public()
  @Get("venues")
  venues(
    @Query("q") q?: string,
    @Query("city") city?: string,
    @Query("country") country?: string,
    @Query("categories") categories?: string,
  ) {
    const categoryList = categories
      ? categories.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.shop.listPublicVenues({
      q,
      city,
      country,
      categories: categoryList,
    });
  }

  @Public()
  @Get("venues/:slug")
  venue(@Param("slug") slug: string) {
    return this.shop.getPublicVenue(slug);
  }
}
