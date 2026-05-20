"use client";

import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MenuBoard } from "@/components/menu/menu-board";
import { ItemDialog, SectionDialog } from "@/components/menu/menu-dialogs";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import {
  createMenuItem,
  createSection,
  deleteMenuItem,
  deleteSection,
  fetchMenu,
  updateMenuItem,
  updateSection,
  uploadMenuItemImage,
  type FullMenu,
  type MenuItem,
  type MenuSection,
} from "@/lib/menu-client";
import type { MealPeriod } from "@/lib/menu-periods";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useVenueSettings } from "@/lib/venue-settings-context";

const GUIDE = DASHBOARD_SECTION_GUIDES.menu;

export default function MenuPage() {
  const { state } = useAuth();
  const { formatMoney } = useVenueSettings();
  const [menu, setMenu] = useState<FullMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sectionDialog, setSectionDialog] = useState<MenuSection | "new" | null>(
    null,
  );
  const [itemDialog, setItemDialog] = useState<{
    item?: MenuItem;
    sectionId: string | null;
  } | null>(null);

  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const perms = membership?.permissions ?? "";
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(perms, "menu.write"));

  const tier = resolveEffectiveTier(
    membership?.shop.subscription
      ? {
          tier: membership.shop.subscription.tier as SubscriptionTier,
          status: membership.shop.subscription.status as
            | "TRIAL"
            | "ACTIVE"
            | "PAST_DUE"
            | "CANCELED",
          trialEndsAt: membership.shop.subscription.trialEndsAt,
        }
      : null,
  );
  const menuUnlocked = isFeatureUnlocked(tier, "menu");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMenu(await fetchMenu());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsBySection = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    if (!menu) return map;
    for (const item of menu.items) {
      if (!item.sectionId) continue;
      const list = map.get(item.sectionId) ?? [];
      list.push(item);
      map.set(item.sectionId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [menu]);

  const uncategorized = useMemo(() => {
    if (!menu) return [];
    return menu.items
      .filter((i) => !i.sectionId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menu]);

  const sections = menu?.sections ?? [];

  async function handleSaveSection(body: {
    name: string;
    mealPeriod: MealPeriod | null;
    availableFrom: string | null;
    availableTo: string | null;
    availableDays: string;
  }) {
    setSaving(true);
    try {
      if (sectionDialog && sectionDialog !== "new") {
        await updateSection(sectionDialog.id, body);
      } else {
        await createSection({
          ...body,
          mealPeriod: body.mealPeriod ?? undefined,
          availableFrom: body.availableFrom ?? undefined,
          availableTo: body.availableTo ?? undefined,
        });
      }
      setSectionDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save section.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveItem(body: Record<string, unknown>) {
    setSaving(true);
    try {
      if (itemDialog?.item) {
        await updateMenuItem(itemDialog.item.id, body);
      } else {
        const created = await createMenuItem(
          body as Parameters<typeof createMenuItem>[0],
        );
        setItemDialog({ item: created, sectionId: created.sectionId });
        await load();
        setSaving(false);
        return;
      }
      setItemDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
      actions={
        canWrite ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSectionDialog("new")}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              <Plus size={14} />
              Section
            </button>
            <button
              type="button"
              onClick={() =>
                setItemDialog({
                  sectionId: sections[0]?.id ?? null,
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
            >
              <Plus size={14} />
              Item
            </button>
          </div>
        ) : null
      }
    >
      <FeatureGate feature="menu" unlocked={menuUnlocked}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : (
          <>
            {!canWrite ? (
              <p className="mb-4 text-xs text-zinc-500">
                View-only — ask your venue admin for menu edit access.
              </p>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-6 shadow-inner md:p-8">
              <MenuBoard
                sections={sections}
                itemsBySection={itemsBySection}
                uncategorized={uncategorized}
                formatPrice={formatMoney}
                canWrite={canWrite && menuUnlocked}
                onEditSection={(s) => setSectionDialog(s)}
                onEditItem={(item) =>
                  setItemDialog({ item, sectionId: item.sectionId })
                }
                onAddItem={(sectionId) =>
                  setItemDialog({ sectionId })
                }
              />
            </div>
          </>
        )}
      </FeatureGate>

      {sectionDialog && canWrite ? (
        <SectionDialog
          section={sectionDialog === "new" ? undefined : sectionDialog}
          saving={saving}
          onClose={() => setSectionDialog(null)}
          onSave={handleSaveSection}
          onDelete={
            sectionDialog !== "new"
              ? async () => {
                  if (
                    !confirm(
                      "Delete this section? Items will become uncategorized.",
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteSection(sectionDialog.id);
                    setSectionDialog(null);
                    await load();
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
        />
      ) : null}

      {itemDialog && canWrite ? (
        <ItemDialog
          item={itemDialog.item}
          sections={sections}
          defaultSectionId={itemDialog.sectionId}
          saving={saving}
          onClose={() => setItemDialog(null)}
          onSave={handleSaveItem}
          onUploadImage={async (slot, file) => {
            if (!itemDialog.item) return;
            const updated = await uploadMenuItemImage(
              itemDialog.item.id,
              slot,
              file,
            );
            setItemDialog({
              item: updated,
              sectionId: updated.sectionId,
            });
            await load();
          }}
          onDelete={
            itemDialog.item
              ? async () => {
                  if (!confirm("Delete this menu item?")) return;
                  setSaving(true);
                  try {
                    await deleteMenuItem(itemDialog.item!.id);
                    setItemDialog(null);
                    await load();
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
        />
      ) : null}
    </TenantPage>
  );
}
