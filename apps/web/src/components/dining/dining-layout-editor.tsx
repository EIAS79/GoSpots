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
import { diningZoneLabel } from "@/lib/dining-layout";
import {
  createGamingSection,
  deleteGamingSection,
  fetchGamingSections,
  type GamingSectionDetail,
} from "@/lib/gaming-layout-client";
import type { GamingOffering } from "@/lib/gaming-menu-client";
import type { SeatingZone } from "@/lib/seating-zone";
import { SEATING_ZONE_LABELS } from "@/lib/seating-zone";
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
      setError(e instanceof Error ? e.message : "Failed to load dining layout.");
    } finally {
      setLoading(false);
    }
  }, [offering.id]);

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

  async function handleCreateArea() {
    if (!createDraft.name.trim()) {
      setError("Area name is required.");
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
      setError(e instanceof Error ? e.message : "Could not create area.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteArea(id: string) {
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    if (section.seatCount > 0) {
      setError("Remove all table types inside this area first.");
      return;
    }
    if (!confirm(`Delete "${section.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGamingSection(id);
      if (activeSectionId === id) setActiveSectionId(null);
      await load();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete area.");
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
        aria-label={`Dining layout — ${offering.name}`}
      >
        <div className="dining-shell sm:max-w-2xl lg:max-w-3xl">
          <header className="dining-shell__header flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/90">
                Dining layout
              </p>
              <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                {offering.name}
              </h2>
              <p className="dining-shell__subtitle mt-1 text-xs text-zinc-500">
                Create areas by floor, then add mixed table types inside each.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
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
                    title="Floors"
                    meta={`Viewing ${activeFloor === 1 ? "ground floor" : `floor ${activeFloor}`}`}
                    badge={`${filteredSections.length} area${filteredSections.length === 1 ? "" : "s"}`}
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
                          {floor === 1 ? "Ground" : `Floor ${floor}`}
                        </button>
                      ))}
                      {floors.length < 10 ? (
                        <button
                          type="button"
                          onClick={addFloor}
                          className="dining-floors__pill inline-flex items-center gap-1 border-dashed text-zinc-500 hover:border-amber-400/30 hover:text-amber-200"
                        >
                          <Plus size={14} />
                          Add floor
                        </button>
                      ) : null}
                    </div>
                  </DiningCollapsible>

                  <DiningCollapsible
                    title="Dining areas"
                    meta={
                      filteredSections.length === 0
                        ? "No areas on this floor yet"
                        : `${filteredSections.length} on this floor`
                    }
                    defaultOpen
                  >
                    {filteredSections.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/15 py-8 text-center">
                        <MapPin className="mx-auto text-zinc-600" size={28} />
                        <p className="mt-3 text-sm text-zinc-400">
                          No dining areas on this floor yet.
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
                                  {diningZoneLabel(section.zone)} ·{" "}
                                  {section.seatCount} table
                                  {section.seatCount === 1 ? "" : "s"}
                                  {groupSummary ? ` · ${groupSummary}` : ""}
                                </p>
                              </div>
                              <div className="dining-area-card__actions">
                                <button
                                  type="button"
                                  onClick={() => setActiveSectionId(section.id)}
                                  className="rounded-lg bg-amber-600 px-3 py-2 font-medium text-white hover:bg-amber-500 sm:py-1.5 sm:text-xs"
                                >
                                  Manage tables
                                </button>
                                <button
                                  type="button"
                                  disabled={saving || section.seatCount > 0}
                                  onClick={() => void handleDeleteArea(section.id)}
                                  title={
                                    section.seatCount > 0
                                      ? "Remove all tables first"
                                      : "Delete area"
                                  }
                                  className="rounded-lg border border-rose-400/20 px-3 py-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 sm:py-1.5 sm:text-xs"
                                >
                                  Delete
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
                      title="New dining area"
                      meta="Name, floor, indoors or outdoors"
                      forceOpen
                    >
                      <div className="space-y-3">
                        <label className="dining-field block">
                          <span>Area name</span>
                          <input
                            value={createDraft.name}
                            onChange={(e) =>
                              setCreateDraft({ ...createDraft, name: e.target.value })
                            }
                            placeholder="Main area, Balcony, Terrace…"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="dining-field block">
                            <span>Floor</span>
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
                                  {f === 1 ? "Ground floor" : `Floor ${f}`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                              Location
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
                                    {SEATING_ZONE_LABELS[zone]}
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
                            Cancel
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
                            Create area
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
                      Add dining area
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
