export type VenueSearchParams = {
  q?: string;
  city?: string;
  country?: string;
  categories?: string[];
};

export function parseVenueSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): VenueSearchParams {
  const categoriesRaw = searchParams.get("categories");
  return {
    q: searchParams.get("q")?.trim() || undefined,
    city: searchParams.get("city")?.trim() || undefined,
    country: searchParams.get("country")?.trim() || undefined,
    categories: categoriesRaw
      ? categoriesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  };
}

export function buildVenueSearchQuery(params: VenueSearchParams) {
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.city?.trim()) sp.set("city", params.city.trim());
  if (params.country?.trim()) sp.set("country", params.country.trim());
  if (params.categories?.length) {
    sp.set("categories", params.categories.join(","));
  }
  return sp;
}

export function venuesSearchHref(params: VenueSearchParams) {
  const qs = buildVenueSearchQuery(params).toString();
  return qs ? `/venues?${qs}` : "/venues";
}
