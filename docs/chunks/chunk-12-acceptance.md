# Chunk 12 — Menu, Ordering and Pricing Foundation 2.0

Status: COMPLETE_ON_UNMERGED_REVIEW_BRANCH

## Delivered
- Modifier groups/modifiers, item↔group links and item variants.
- Commerce profile provides tax-category, prep-routing, recipe and cashier-favorite hooks.
- Dedicated server pricing accepts IDs/context only; client money values are never trusted.
- Immutable order-line snapshots preserve item/variant/modifier names, component prices, tax and routing/recipe hooks.
- Quick sale, GuestCheck, dining, play-session, takeaway, preorder and event modes share one order model; play-session orders inherit its GuestCheck/resource.
- Order-entry UI provides Favorites, categories, search and opens configuration only when the item needs variants/modifiers.

## Gate 12
- [x] variants/modifiers.
- [x] order on same GuestCheck as play session.
- [x] server price calculation.
- [x] order snapshot immutable historically.
- [x] gaming venue with menu disabled remains uncluttered because ordering is a separate route.

This PR is intentionally unmerged. Exact-head CI must remain green before merge is ever requested.
