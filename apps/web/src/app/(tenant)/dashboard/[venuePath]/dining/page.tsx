"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DiningLayoutEditor } from "@/components/dining/dining-layout-editor";
import { GamingMenuPanel } from "@/components/gaming/gaming-menu-panel";
import { GamingOfferingEditor } from "@/components/gaming/gaming-offering-editor";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { fetchDiningMenu } from "@/lib/dining-menu-client";
import type { GamingMenuResponse, GamingOffering } from "@/lib/gaming-menu-client";
import { fetchDaySchedule, type DaySchedule } from "@/lib/reservations-client";
import type { ResourceType } from "@/lib/resource-types";
import {
  createResourceCategory,
  deleteResourceCategory,
  updateResourceCategory,
  uploadResourceCategoryImage,
} from "@/lib/resources-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { showsDiningUi } from "@/lib/venue-packs";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettings } from "@/lib/venue-settings-context";
import {
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";

export default function DiningPage() {
  const { state } = useAuth();
  const { formatMoney, t, shop, locale } = useVenueSettings();
  const venueTimeZone = resolveVenueTimeZone({
    timezone: shop?.timezone,
    locale: shop?.locale ?? locale,
  });
  const guide = useDashboardGuide("dining");
  const access = useVenueAccess();
  const [menu, setMenu] = useState<GamingMenuResponse | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editor, setEditor] = useState<{
    offering?: GamingOffering;
    initialType?: ResourceType;
  } | null>(null);
  const [layoutEditor, setLayoutEditor] = useState<GamingOffering | null>(null);

  const membership = useCurrentMembership();
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "resource.write"));

  const unlocked =
    isFeatureUnlocked(access.enabledModules, "resource") &&
    showsDiningUi(access.packId, access.addOns);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const [menuData, scheduleData] = await Promise.all([
        fetchDiningMenu(),
        fetchDaySchedule(venueDayKey(venueTimeZone)),
      ]);
      setMenu(menuData);
      setSchedule(scheduleData);
      return true;
    } catch (e) {
      if (!opts.silent) {
        setError(e instanceof Error ? e.message : t("diningSetup.loadError"));
      }
      return false;
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [t, venueTimeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 15_000,
    refreshOnSections: ["reservation"],
  });

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      <FeatureGate feature="resource" unlocked={unlocked}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : menu ? (
          <GamingMenuPanel
            menu={menu}
            schedule={schedule}
            formatPrice={formatMoney}
            canWrite={canWrite && unlocked}
            variant="dining"
            onEdit={(o) => setEditor({ offering: o })}
            onEditLayout={(o) => setLayoutEditor(o)}
            onAddType={(type) => setEditor({ initialType: type })}
          />
        ) : null}
      </FeatureGate>

      {editor && canWrite && unlocked ? (
        <GamingOfferingEditor
          offering={editor.offering}
          initialType={editor.initialType ?? "DINING"}
          variant="dining"
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={async (body, imageFile) => {
            setSaving(true);
            try {
              if (editor.offering) {
                await updateResourceCategory(editor.offering.id, {
                  expectedVersion: editor.offering.version,
                  name: body.name,
                  description: body.description,
                  slotMinutes: body.slotMinutes,
                  bookingMode: body.bookingMode,
                  playstationGames: body.playstationGames,
                  offeringConfig: body.offeringConfig ?? null,
                  rates: body.rates,
                });
                if (imageFile) {
                  await uploadResourceCategoryImage(
                    editor.offering.id,
                    "1",
                    imageFile,
                  );
                }
              } else {
                const created = await createResourceCategory({
                  type: "DINING",
                  name: body.name,
                  description: body.description ?? undefined,
                  slotMinutes: body.slotMinutes,
                  bookingMode: body.bookingMode,
                  playstationGames: body.playstationGames,
                  offeringConfig: body.offeringConfig,
                  rates: body.rates,
                });
                if (imageFile) {
                  await uploadResourceCategoryImage(created.id, "1", imageFile);
                }
              }
              setEditor(null);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : t("gamingSetup.editor.saveFailed"));
            } finally {
              setSaving(false);
            }
          }}
          onDelete={
            editor.offering
              ? async () => {
                  if (
                    !confirm(
                      t("gamingSetup.panel.deleteOfferingConfirm", {
                        name: editor.offering!.name,
                        plural: editor.offering!.unitLabels.plural,
                      }),
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteResourceCategory(editor.offering!.id);
                    setEditor(null);
                    await load();
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onUploadImage={
            editor.offering
              ? async (slot, file) => {
                  const cat = await uploadResourceCategoryImage(
                    editor.offering!.id,
                    slot,
                    file,
                  );
                  setEditor((prev) =>
                    prev?.offering
                      ? {
                          ...prev,
                          offering: {
                            ...prev.offering,
                            ...(slot === "1"
                              ? { imageUrl: cat.imageUrl }
                              : { imageUrl2: cat.imageUrl2 }),
                          },
                        }
                      : prev,
                  );
                  await load();
                  return slot === "1" ? cat.imageUrl : cat.imageUrl2;
                }
              : undefined
          }
        />
      ) : null}

      {layoutEditor && canWrite && unlocked ? (
        <DiningLayoutEditor
          offering={layoutEditor}
          onClose={() => setLayoutEditor(null)}
          onSaved={() => {
            void load({ silent: true });
          }}
        />
      ) : null}
    </TenantPage>
  );
}
