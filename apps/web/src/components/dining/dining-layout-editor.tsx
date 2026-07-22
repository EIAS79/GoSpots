"use client";

import {
  Building2,
  Loader2,
  MapPin,
  Plus,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiningAreaDetail } from "@/components/dining/dining-area-detail";
import { DiningCollapsible } from "@/components/dining/dining-collapsible";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/cn";
import {
  createGamingSection,
  deleteGamingSection,
  fetchGamingSections,
  type GamingSectionDetail,
} from "@/lib/gaming-layout-client";
import type { GamingOffering } from "@/lib/gaming-menu-client";
import type { SeatingZone } from "@/lib/seating-zone";
import { seatingZoneLabel } from "@/lib/seating-zone";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT } from "@/lib/staff-floor-i18n";
import "./dining-layout.css";

type AreaDraft = {
  name: string;
  floor: string;
  zone: SeatingZone;
};

export function DiningLayoutEditor({
  offering,
  onClose,
  onSaved,
}: {
  offering: GamingOffering;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const [sections, setSections] = useState<GamingSectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);
  const [extraFloors, setExtraFloors] = useState<number[]>([]);
  const [showCreateArea, setShowCreateArea] = useState(false);
  const [createDraft, setCreateDraft] = useState<AreaDraft>({
    name: "",
    floor: "1",
    zone: "INDOOR",
  });
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGamingSections(offering.id);
      setSections(data.sections);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diningSetup.loadError"));
    } finally {
      setLoading(false);
    }
  }, [offering.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const floors = useMemo(() => {
    const set = new Set<number>([1, ...sections.map((s) => s.floor), ...extraFloors]);
    return [...set].sort((a, b) => a - b);
  }, [sections, extraFloors]);

  useEffect(() => {
    if (!floors.includes(activeFloor)) {
      setActiveFloor(floors[0] ?? 1);
    }
  }, [floors, activeFloor]);

  const filteredSections = sections.filter((s) => s.floor === activeFloor);
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;

  function addFloor() {
    const next = Math.max(...floors, 0) + 1;
    if (next > 10) return;
    setExtraFloors((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setActiveFloor(next);
  }

  function openCreateArea() {
    setCreateDraft({ name: "", floor: String(activeFloor), zone: "INDOOR" });
    setShowCreateArea(true);
  }

  function floorPillLabel(floor: number) {
    return floor === 1
      ? t("diningSetup.ground")
      : t("diningSetup.floorOption", { n: floor });
  }

  function floorSelectLabel(floor: number) {
    return floor === 1
      ? t("diningSetup.groundFloorOption")
      : t("diningSetup.floorOption", { n: floor });
  }

  async function handleCreateArea() {
    if (!createDraft.name.trim()) {
      setError(t("diningSetup.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await createGamingSection({
        categoryId: offering.id,
        name: createDraft.name.trim(),
        floor: Number(createDraft.floor) || 1,
        zone: createDraft.zone,
        seatCount: 0,
      });
      setSections(data.sections);
      setShowCreateArea(false);
      const created = data.sections.find(
        (s) => s.name === createDraft.name.trim(),
      );
      if (created) setActiveSectionId(created.id);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diningSetup.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteArea(id: string) {
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    if (section.seatCount > 0) {
      setError(t("diningSetup.removeTablesFirst"));
      return;
    }
    if (!confirm(t("diningSetup.deleteConfirm", { name: section.name }))) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGamingSection(id);
      if (activeSectionId === id) setActiveSectionId(null);
      await load();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diningSetup.deleteError"));
    } finally {
      setSaving(false);
    }
  }

  function handleSectionsUpdated(updated: GamingSectionDetail[]) {
    setSections(updated);
    void onSaved();
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={t("diningSetup.ariaLabel", { name: offering.name })}
      >
        <div className="dining-shell sm:max-w-2xl lg:max-w-3xl">
          <header className="dining-shell__header flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/90">
                {t("diningSetup.headerLabel")}
              </p>
              <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                {offering.name}
              </h2>
              <p className="dining-shell__subtitle mt-1 text-xs text-zinc-500">
                {t("diningSetup.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("diningSetup.close")}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 sm:size-8"
            >
              <X size={18} />
            </button>
          </header>

          {activeSection ? (
            <DiningAreaDetail
              section={activeSection}
              floors={floors}
              onBack={() => setActiveSectionId(null)}
              onUpdated={handleSectionsUpdated}
            />
          ) : (
            <div className="dining-shell__body">
              {error ? (
                <FeedbackBanner variant="error" message={error} className="mb-4" />
              ) : null}

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  <DiningCollapsible
                    title={t("diningSetup.floorsTitle")}
                    meta={
                      activeFloor === 1
                        ? t("diningSetup.viewingGround")
                        : t("diningSetup.viewingFloor", { n: activeFloor })
                    }
                    badge={
                      filteredSections.length === 1
                        ? t("diningSetup.areaCountOne", {
                            n: filteredSections.length,
                          })
                        : t("diningSetup.areaCountMany", {
                            n: filteredSections.length,
                          })
                    }
                    defaultOpen
                  >
                    <div className="dining-floors">
                      {floors.map((floor) => (
                        <button
                          key={floor}
                          type="button"
                          onClick={() => setActiveFloor(floor)}
                          className={cn(
                            "dining-floors__pill inline-flex items-center gap-1.5 font-medium transition-colors",
                            activeFloor === floor
                              ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                              : "text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                          )}
                        >
                          <Building2 size={14} />
                          {floorPillLabel(floor)}
                        </button>
                      ))}
                      {floors.length < 10 ? (
                        <button
                          type="button"
                          onClick={addFloor}
                          className="dining-floors__pill inline-flex items-center gap-1 border-dashed text-zinc-500 hover:border-amber-400/30 hover:text-amber-200"
                        >
                          <Plus size={14} />
                          {t("diningSetup.addFloor")}
                        </button>
                      ) : null}
                    </div>
                  </DiningCollapsible>

                  <DiningCollapsible
                    title={t("diningSetup.areasTitle")}
                    meta={
                      filteredSections.length === 0
                        ? t("diningSetup.noAreasFloor")
                        : t("diningSetup.areasOnFloor", {
                            n: filteredSections.length,
                          })
                    }
                    defaultOpen
                  >
                    {filteredSections.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/15 py-8 text-center">
                        <MapPin className="mx-auto text-zinc-600" size={28} />
                        <p className="mt-3 text-sm text-zinc-400">
                          {t("diningSetup.noAreasFloorLong")}
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {filteredSections.map((section) => {
                          const groupSummary = (section.tableGroups ?? [])
                            .map((g) => `${g.tableCount}×${g.capacity}`)
                            .join(", ");
                          return (
                            <li key={section.id} className="dining-area-card">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-medium text-white">
                                  {section.name}
                                </h3>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                  {seatingZoneLabel(t, section.zone)} ·{" "}
                                  {section.seatCount === 1
                                    ? t("diningSetup.tableCountOne", {
                                        n: section.seatCount,
                                      })
                                    : t("diningSetup.tableCountMany", {
                                        n: section.seatCount,
                                      })}
                                  {groupSummary ? ` · ${groupSummary}` : ""}
                                </p>
                              </div>
                              <div className="dining-area-card__actions">
                                <button
                                  type="button"
                                  onClick={() => setActiveSectionId(section.id)}
                                  className="rounded-lg bg-amber-600 px-3 py-2 font-medium text-white hover:bg-amber-500 sm:py-1.5 sm:text-xs"
                                >
                                  {t("diningSetup.manageTables")}
                                </button>
                                <button
                                  type="button"
                                  disabled={saving || section.seatCount > 0}
                                  onClick={() => void handleDeleteArea(section.id)}
                                  title={
                                    section.seatCount > 0
                                      ? t("diningSetup.deleteAreaTooltipBlocked")
                                      : t("diningSetup.deleteAreaTooltip")
                                  }
                                  className="rounded-lg border border-rose-400/20 px-3 py-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 sm:py-1.5 sm:text-xs"
                                >
                                  {t("diningSetup.delete")}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </DiningCollapsible>

                  {showCreateArea ? (
                    <DiningCollapsible
                      title={t("diningSetup.newAreaTitle")}
                      meta={t("diningSetup.newAreaMeta")}
                      forceOpen
                    >
                      <div className="space-y-3">
                        <label className="dining-field block">
                          <span>{t("diningSetup.areaNameLabel")}</span>
                          <input
                            value={createDraft.name}
                            onChange={(e) =>
                              setCreateDraft({ ...createDraft, name: e.target.value })
                            }
                            placeholder={t("diningSetup.areaNamePlaceholder")}
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="dining-field block">
                            <span>{t("diningSetup.floorField")}</span>
                            <select
                              value={createDraft.floor}
                              onChange={(e) =>
                                setCreateDraft({
                                  ...createDraft,
                                  floor: e.target.value,
                                })
                              }
                            >
                              {floors.map((f) => (
                                <option key={f} value={f}>
                                  {floorSelectLabel(f)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                              {t("diningSetup.locationLabel")}
                            </span>
                            <div className="dining-zone-toggle mt-1.5">
                              {(["INDOOR", "OUTDOOR"] as SeatingZone[]).map(
                                (zone) => (
                                  <button
                                    key={zone}
                                    type="button"
                                    onClick={() =>
                                      setCreateDraft({ ...createDraft, zone })
                                    }
                                    className={cn(
                                      "flex items-center justify-center gap-1 rounded-lg border",
                                      createDraft.zone === zone
                                        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                        : "border-white/10 text-zinc-400",
                                    )}
                                  >
                                    {zone === "OUTDOOR" ? (
                                      <Sun size={14} />
                                    ) : (
                                      <Building2 size={14} />
                                    )}
                                    {seatingZoneLabel(t, zone)}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="dining-sticky-actions flex justify-end gap-2 sm:static sm:mt-2 sm:border-0 sm:bg-transparent sm:pt-2">
                          <button
                            type="button"
                            onClick={() => setShowCreateArea(false)}
                            className="min-h-[2.75rem] rounded-lg border border-white/10 px-4 text-sm text-zinc-400 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleCreateArea()}
                            className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 sm:min-h-0 sm:px-4 sm:py-2 sm:text-xs"
                          >
                            {saving ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : null}
                            {t("diningSetup.createAreaSubmit")}
                          </button>
                        </div>
                      </div>
                    </DiningCollapsible>
                  ) : (
                    <button
                      type="button"
                      onClick={openCreateArea}
                      className="inline-flex w-full min-h-[3rem] items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm text-zinc-400 hover:border-amber-400/30 hover:text-amber-200"
                    >
                      <Plus size={18} />
                      {t("diningSetup.addDiningArea")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
