import { ForbiddenException } from '@nestjs/common';
import type { JwtAccessPayload } from '../modules/auth/auth.service';

export function requireShopId(actor: JwtAccessPayload): string {
  if (!actor.shopId) {
    throw new ForbiddenException('No venue selected in session.');
  }
  return actor.shopId;
}

export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
}
