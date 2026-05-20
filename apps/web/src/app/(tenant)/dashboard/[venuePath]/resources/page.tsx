"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GamingMenuPanel } from "@/components/gaming/gaming-menu-panel";
import { GamingOfferingEditor } from "@/components/gaming/gaming-offering-editor";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import {
  fetchGamingMenu,
  type GamingMenuResponse,
  type GamingOffering,
} from "@/lib/gaming-menu-client";
import type { ResourceType } from "@/lib/resource-types";
import {
  createResourceCategory,
  deleteResourceCategory,
  updateResourceCategory,
  uploadResourceCategoryImage,
} from "@/lib/resources-client";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useVenueSettings } from "@/lib/venue-settings-context";

const GUIDE = {
  title: "Gaming",
  description:
    "Your venue’s game menu — only add what you offer. Set seats, tables, or lanes, specs, pricing, and photos. Reservations reduce live availability.",
  capabilities: [
    "PC & PlayStation: count seats, list GPU/console specs.",
    "Billiard: tables · Bowling: lanes — each with its own photo.",
    "Price per hour, 30 min, or custom tiers.",
    "Live stock: bookings subtract from free seats/tables/lanes.",
  ],
};

export default function ResourcesPage() {
  const { state } = useAuth();
  const { formatMoney } = useVenueSettings();
  const [menu, setMenu] = useState<GamingMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editor, setEditor] = useState<{
    offering?: GamingOffering;
    initialType?: ResourceType;
  } | null>(null);

  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(membership?.permissions ?? "", "resource.write"));

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
  const unlocked = isFeatureUnlocked(tier, "resource");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMenu(await fetchGamingMenu());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gaming menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
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
            formatPrice={formatMoney}
            canWrite={canWrite && unlocked}
            onEdit={(o) => setEditor({ offering: o })}
            onAddType={(type) => setEditor({ initialType: type })}
          />
        ) : null}
      </FeatureGate>

      {editor && canWrite && unlocked ? (
        <GamingOfferingEditor
          offering={editor.offering}
          initialType={editor.initialType}
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={async (body, imageFile) => {
            setSaving(true);
            try {
              if (editor.offering) {
                await updateResourceCategory(editor.offering.id, {
                  name: body.name,
                  description: body.description,
                  slotMinutes: body.slotMinutes,
                  totalUnits: body.totalUnits,
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
                  type: body.type,
                  name: body.name,
                  description: body.description ?? undefined,
                  slotMinutes: body.slotMinutes,
                  unitCount: body.totalUnits,
                  rates: body.rates,
                });
                if (imageFile) {
                  await uploadResourceCategoryImage(created.id, "1", imageFile);
                }
              }
              setEditor(null);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Save failed.");
            } finally {
              setSaving(false);
            }
          }}
          onDelete={
            editor.offering
              ? async () => {
                  if (
                    !confirm(
                      `Remove ${editor.offering!.name} and all its ${editor.offering!.unitLabels.plural}?`,
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
              ? async (file) => {
                  const cat = await uploadResourceCategoryImage(
                    editor.offering!.id,
                    "1",
                    file,
                  );
                  setEditor((prev) =>
                    prev?.offering
                      ? {
                          ...prev,
                          offering: {
                            ...prev.offering,
                            imageUrl: cat.imageUrl,
                          },
                        }
                      : prev,
                  );
                  await load();
                  return cat.imageUrl;
                }
              : undefined
          }
        />
      ) : null}
    </TenantPage>
  );
}
