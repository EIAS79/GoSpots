"use client";

import { Loader2, Plus, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MenuBoard } from "@/components/menu/menu-board";
import { ItemDialog, SectionDialog } from "@/components/menu/menu-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { publishLiveEvent } from "@/lib/live-events";
import {
  createMenuItem,
  createSection,
  deleteMenuItem,
  deleteSection,
  fetchMenu,
  updateMenuItem,
  updateSection,
  uploadMenuItemImage,
  uploadSectionImage,
  type FullMenu,
  type MenuItem,
  type MenuSection,
} from "@/lib/menu-client";
import type { MealPeriod } from "@/lib/menu-periods";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettings } from "@/lib/venue-settings-context";

function notifyMenuChanged() {
  publishLiveEvent({ section: "menu" });
}

export default function MenuPage() {
  const guide = useDashboardGuide("menu");
  const { state } = useAuth();
  const { formatMoney } = useVenueSettings();
  const access = useVenueAccess();
  const [menu, setMenu] = useState<FullMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sectionDialog, setSectionDialog] = useState<MenuSection | "new" | null>(
    null,
  );
  const [itemDialog, setItemDialog] = useState<{
    item?: MenuItem;
    sectionId: string | null;
  } | null>(null);
  const [sectionToRemove, setSectionToRemove] = useState<MenuSection[] | null>(
    null,
  );
  const [itemToRemove, setItemToRemove] = useState<MenuItem | null>(null);

  const loadGen = useRef(0);

  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(perms, "menu.write"));

  const menuUnlocked = isFeatureUnlocked(access.enabledModules, "menu");

  const applyMenu = useCallback((next: FullMenu) => {
    setMenu(next);
    setItemDialog((prev) => {
      if (!prev?.item) return prev;
      const fresh = next.items.find((i) => i.id === prev.item!.id);
      return fresh ? { ...prev, item: fresh } : prev;
    });
    setSectionDialog((prev) => {
      if (!prev || prev === "new") return prev;
      const fresh = next.sections.find((s) => s.id === prev.id);
      return fresh ?? prev;
    });
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const gen = ++loadGen.current;
      if (!opts?.silent) setLoading(true);
      else setSyncing(true);
      if (!opts?.silent) setError(null);
      try {
        const data = await fetchMenu();
        if (gen !== loadGen.current) return;
        applyMenu(data);
      } catch (e) {
        if (gen !== loadGen.current) return;
        if (opts?.silent && e instanceof ApiError && e.status === 401) return;
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : "Failed to load menu.");
        }
      } finally {
        if (gen !== loadGen.current) return;
        if (!opts?.silent) setLoading(false);
        else setSyncing(false);
      }
    },
    [applyMenu],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 12_000,
    refreshOnSections: ["menu", "shop_orders"],
  });

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
      let saved: MenuSection;
      if (sectionDialog && sectionDialog !== "new") {
        saved = await updateSection(sectionDialog.id, body);
        setMenu((m) =>
          m
            ? {
                ...m,
                sections: m.sections.map((s) =>
                  s.id === saved.id ? saved : s,
                ),
              }
            : m,
        );
      } else {
        saved = await createSection({
          ...body,
          mealPeriod: body.mealPeriod ?? undefined,
          availableFrom: body.availableFrom ?? undefined,
          availableTo: body.availableTo ?? undefined,
        });
        setMenu((m) =>
          m ? { ...m, sections: [...m.sections, saved] } : m,
        );
      }
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save section.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function handleSectionSaved() {
    notifyMenuChanged();
  }

  async function handleSaveItem(body: Record<string, unknown>) {
    setSaving(true);
    try {
      if (itemDialog?.item) {
        const updated = await updateMenuItem(itemDialog.item.id, body);
        setMenu((m) =>
          m
            ? {
                ...m,
                items: m.items.map((i) =>
                  i.id === updated.id ? updated : i,
                ),
              }
            : m,
        );
        return updated;
      }
      const created = await createMenuItem(
        body as Parameters<typeof createMenuItem>[0],
      );
      setMenu((m) => (m ? { ...m, items: [...m.items, created] } : m));
      return created;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save item.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function handleItemSaved() {
    notifyMenuChanged();
  }

  async function handleItemImageUpload(
    itemId: string,
    slot: "1" | "2",
    file: File,
  ) {
    const updated = await uploadMenuItemImage(itemId, slot, file);
    setMenu((m) =>
      m
        ? {
            ...m,
            items: m.items.map((i) => (i.id === updated.id ? updated : i)),
          }
        : m,
    );
  }

  async function handleSectionImageUpload(sectionId: string, file: File) {
    try {
      const updated = await uploadSectionImage(sectionId, file);
      setMenu((m) =>
        m
          ? {
              ...m,
              sections: m.sections.map((s) =>
                s.id === updated.id ? updated : s,
              ),
            }
          : m,
      );
      setSectionDialog((prev) =>
        prev && prev !== "new" && prev.id === updated.id ? updated : prev,
      );
      notifyMenuChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not upload section photo.",
      );
      throw e;
    }
  }

  async function executeDeleteSections(sectionsToDelete: MenuSection[]) {
    if (sectionsToDelete.length === 0) return;
    setSaving(true);
    try {
      const ids = new Set(sectionsToDelete.map((s) => s.id));
      for (const section of sectionsToDelete) {
        await deleteSection(section.id);
      }
      setMenu((m) =>
        m
          ? {
              ...m,
              sections: m.sections.filter((s) => !ids.has(s.id)),
              items: m.items.map((i) =>
                i.sectionId && ids.has(i.sectionId)
                  ? { ...i, sectionId: null }
                  : i,
              ),
            }
          : m,
      );
      if (
        sectionDialog &&
        sectionDialog !== "new" &&
        ids.has(sectionDialog.id)
      ) {
        setSectionDialog(null);
      }
      setSectionToRemove(null);
      notifyMenuChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove section.");
    } finally {
      setSaving(false);
    }
  }

  async function executeDeleteItem(item: MenuItem) {
    setSaving(true);
    try {
      await deleteMenuItem(item.id);
      setMenu((m) =>
        m ? { ...m, items: m.items.filter((i) => i.id !== item.id) } : m,
      );
      if (itemDialog?.item?.id === item.id) setItemDialog(null);
      setItemToRemove(null);
      notifyMenuChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove item.");
    } finally {
      setSaving(false);
    }
  }

  const hasSections = sections.length > 0;

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
      actions={
        canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {syncing ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/80">
                <Radio size={10} className="animate-pulse" />
                Live
              </span>
            ) : null}
            {!hasSections ? (
              <button
                type="button"
                onClick={() => setSectionDialog("new")}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
              >
                <Plus size={14} />
                Add section
              </button>
            ) : null}
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

            <div className="flex justify-center">
              <MenuBoard
                sections={sections}
                itemsBySection={itemsBySection}
                uncategorized={uncategorized}
                formatPrice={formatMoney}
                canWrite={canWrite && menuUnlocked}
                onAddSection={() => setSectionDialog("new")}
                onEditSection={(s) => setSectionDialog(s)}
                onRemoveSections={setSectionToRemove}
                onEditItem={(item) =>
                  setItemDialog({ item, sectionId: item.sectionId })
                }
                onAddItem={(sectionId) => setItemDialog({ sectionId })}
                onDeleteItem={(item) => setItemToRemove(item)}
              />
            </div>
          </>
        )}
      </FeatureGate>

      {sectionDialog && canWrite ? (
        <SectionDialog
          key={sectionDialog === "new" ? "new" : sectionDialog.id}
          section={sectionDialog === "new" ? undefined : sectionDialog}
          saving={saving}
          onClose={() => setSectionDialog(null)}
          onSave={handleSaveSection}
          onUploadImage={handleSectionImageUpload}
          onClearImage={
            sectionDialog !== "new"
              ? async () => {
                  const updated = await updateSection(sectionDialog.id, {
                    imageUrl: null,
                  });
                  setMenu((m) =>
                    m
                      ? {
                          ...m,
                          sections: m.sections.map((s) =>
                            s.id === updated.id ? updated : s,
                          ),
                        }
                      : m,
                  );
                  setSectionDialog(updated);
                  notifyMenuChanged();
                }
              : undefined
          }
          onDelete={
            sectionDialog !== "new"
              ? () => {
                  setSectionDialog(null);
                  setSectionToRemove([sectionDialog]);
                }
              : undefined
          }
          onSaved={handleSectionSaved}
        />
      ) : null}

      <ConfirmDialog
        open={sectionToRemove !== null}
        title={
          sectionToRemove && sectionToRemove.length > 1
            ? "Remove sections?"
            : "Remove section?"
        }
        description={
          sectionToRemove
            ? sectionToRemove.length === 1
              ? `"${sectionToRemove[0]!.name}" will be removed. Items in this section become uncategorized. This cannot be undone.`
              : `${sectionToRemove.length} sections will be removed (${sectionToRemove.map((s) => s.name).join(", ")}). Items in those sections become uncategorized. This cannot be undone.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        busy={saving}
        onCancel={() => setSectionToRemove(null)}
        onConfirm={() => {
          if (sectionToRemove) void executeDeleteSections(sectionToRemove);
        }}
      />

      <ConfirmDialog
        open={itemToRemove !== null}
        title="Remove item?"
        description={
          itemToRemove
            ? `"${itemToRemove.name}" will be removed from your menu. This cannot be undone.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        busy={saving}
        onCancel={() => setItemToRemove(null)}
        onConfirm={() => {
          if (itemToRemove) void executeDeleteItem(itemToRemove);
        }}
      />

      {itemDialog && canWrite ? (
        <ItemDialog
          key={itemDialog.item?.id ?? `new-${itemDialog.sectionId ?? "none"}`}
          item={itemDialog.item}
          sections={sections}
          defaultSectionId={itemDialog.sectionId}
          saving={saving}
          onClose={() => setItemDialog(null)}
          onSave={handleSaveItem}
          onSaved={handleItemSaved}
          onUploadImage={handleItemImageUpload}
          onDelete={
            itemDialog.item
              ? () => setItemToRemove(itemDialog.item!)
              : undefined
          }
        />
      ) : null}
    </TenantPage>
  );
}
