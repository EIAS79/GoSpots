import { api } from "./api";
import type { GamingMenuResponse } from "./gaming-menu-client";

export function fetchDiningMenu() {
  return api<GamingMenuResponse>("/resources/dining-menu");
}

export type DiningMenuResponse = GamingMenuResponse;
