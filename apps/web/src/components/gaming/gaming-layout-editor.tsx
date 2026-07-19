"use client";

import {
  Crown,
  ImagePlus,
  Layers,
  Loader2,
  Map,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/cn";
import {
  createGamingSection,
  deleteGamingSection,
  fetchGamingSections,
  updateGamingSection,
  uploadGamingSectionImage,
  type GamingSectionDetail,
} from "@/lib/gaming-layout-client";
import type { GamingOffering } from "@/lib/gaming-menu-client";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";

type SectionDraft = {
  name: string;
  floor: string;
  isVip: boolean;
  seatsPerRow: string;
  seatCount: string;
  defaultTableCapacity: string;
};

const EMPTY_DRAFT: SectionDraft = {
  name: "",
  floor: "1",
  isVip: false,
  seatsPerRow: "6",
  seatCount: "6",
  defaultTableCapacity: "4",
};

export function GamingLayoutEditor({
  offering,
  onClose,
  onSaved,
}: {
  offering: GamingOffering;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isDining = offering.type === "DINING";
  const [sections, setSections] = useState<GamingSectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<SectionDraft>({
    ...EMPTY_DRAFT,
    name:
      offering.type === "PLAYSTATION"
        ? "PS5 area"
        : offering.type === "BILLIARD"
          ? "Main hall"
          : offering.type === "TABLE_TENNIS"
            ? "Ping pong area"
            : offering.type === "FOOSBALL"
              ? "Baby foot area"
              : offering.type === "ARCADE"
                ? "Arcade floor"
                : offering.type === "BOWLING"
                  ? "Lane area"
                  : offering.type === "DINING"
                    ? "Main dining room"
                    : "Main area",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SectionDraft>(EMPTY_DRAFT);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGamingSections(offering.id);
      setSections(data.sections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load layout.");
    } finally {
      setLoading(false);
    }
  }, [offering.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (section: GamingSectionDetail) => {
    setEditingId(section.id);
    setEditDraft({
      name: section.name,
      floor: String(section.floor),
      isVip: section.isVip,
      seatsPerRow: String(section.seatsPerRow),
      seatCount: String(section.seatCount),
      defaultTableCapacity: "4",
    });
  };

  const handleAdd = async () => {
    if (!addDraft.name.trim()) {
      setError("Section name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await createGamingSection({
        categoryId: offering.id,
        name: addDraft.name.trim(),
        floor: Number(addDraft.floor) || 1,
        isVip: addDraft.isVip,
        seatsPerRow: Number(addDraft.seatsPerRow) || 6,
        seatCount: Number(addDraft.seatCount) || 0,
        ...(isDining
          ? {
              defaultTableCapacity:
                Number(addDraft.defaultTableCapacity) || 4,
            }
          : {}),
      });
      setSections(data.sections);
      setShowAdd(false);
      setAddDraft({
        ...EMPTY_DRAFT,
        name: "",
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add section.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editDraft.name.trim()) {
      setError("Section name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await updateGamingSection(id, {
        name: editDraft.name.trim(),
        floor: Number(editDraft.floor) || 1,
        isVip: editDraft.isVip,
        seatsPerRow: Number(editDraft.seatsPerRow) || 6,
        seatCount: Number(editDraft.seatCount) || 0,
      });
      setSections(data.sections);
      setEditingId(null);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update section.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this zone? Seats must be empty or moved first.")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGamingSection(id);
      await load();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete section.");
    } finally {
      setSaving(false);
    }
  };

  const floors = useMemo(
    () => [...new Set(sections.map((s) => s.floor))].sort((a, b) => a - b),
    [sections],
  );

  useEffect(() => {
    if (floors.length === 0) {
      setActiveFloor(null);
      return;
    }
    setActiveFloor((prev) =>
      prev != null && floors.includes(prev) ? prev : floors[0],
    );
  }, [floors]);

  const filteredSections =
    activeFloor == null
      ? sections
      : sections.filter((s) => s.floor === activeFloor);

  const handleSectionImage = async (sectionId: string, file: File) => {
    setSaving(true);
    setError(null);
    try {
      const data = await uploadGamingSectionImage(sectionId, file);
      setSections(data.sections);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload image.");
    } finally {
      setSaving(false);
    }
  };

  const openAddZone = () => {
    setAddDraft((d) => ({
      ...d,
      floor: String(activeFloor ?? 1),
    }));
    setShowAdd(true);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl md:max-w-2xl">
          <header className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-emerald-500/80">
                Floor layout · {RESOURCE_TYPE_LABELS[offering.type]}
              </p>
              <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                {offering.name}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 sm:block">
                {isDining
                  ? "Split your restaurant into dining rooms, floors, patio areas, and VIP sections."
                  : "Split your venue into zones — VIP rooms, floors, PC vs PS5 areas."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            {error ? (
              <FeedbackBanner variant="error" message={error} className="mb-4" />
            ) : null}

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {floors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {floors.map((floor) => {
                      const count = sections.filter((s) => s.floor === floor).length;
                      const selected = activeFloor === floor;
                      return (
                        <button
                          key={floor}
                          type="button"
                          onClick={() => setActiveFloor(floor)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                            selected
                              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                          )}
                        >
                          <Layers size={12} />
                          Floor {floor}
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-px text-[9px]",
                              selected
                                ? "bg-emerald-500/25 text-emerald-100"
                                : "bg-white/10 text-zinc-500",
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {sections.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-500">
                    {isDining
                      ? "No dining zones yet. Add a main room, patio, or private area."
                      : "No zones yet. Add a VIP room, main hall, or second-floor area."}
                  </p>
                ) : filteredSections.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-500">
                    No zones on floor {activeFloor} yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredSections.map((section) => (
                      <li
                        key={section.id}
                        className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 sm:p-4"
                      >
                        {editingId === section.id ? (
                          <SectionForm
                            draft={editDraft}
                            unitLabels={offering.unitLabels}
                            showTableCapacity={isDining}
                            onChange={setEditDraft}
                            onCancel={() => setEditingId(null)}
                            onSubmit={() => void handleUpdate(section.id)}
                            saving={saving}
                            submitLabel="Save zone"
                          />
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex gap-3">
                              {section.imageUrl ? (
                                <img
                                  src={section.imageUrl}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                                />
                              ) : null}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Map size={14} className="text-emerald-400/80" />
                                <h3 className="font-medium text-white">
                                  {section.name}
                                </h3>
                                {section.isVip ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                                    <Crown size={10} />
                                    VIP
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-zinc-500">
                                Floor {section.floor} · {section.seatCount}{" "}
                                {offering.unitLabels.plural} ·{" "}
                                {section.seatsPerRow} per row
                              </p>
                            </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2 self-end sm:self-auto">
                              <label
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5",
                                  saving && "pointer-events-none opacity-50",
                                )}
                              >
                                <ImagePlus size={12} />
                                {section.imageUrl ? "Change" : "Photo"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  disabled={saving}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (file) void handleSectionImage(section.id, file);
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => startEdit(section)}
                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={saving || section.seatCount > 0}
                                onClick={() => void handleDelete(section.id)}
                                title={
                                  section.seatCount > 0
                                    ? "Move or remove seats before deleting"
                                    : "Delete zone"
                                }
                                className="grid size-8 place-items-center rounded-lg border border-rose-400/20 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {showAdd ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                    <p className="mb-3 text-xs font-medium text-emerald-200">
                      New zone
                    </p>
                    <SectionForm
                      draft={addDraft}
                      unitLabels={offering.unitLabels}
                      showTableCapacity={isDining}
                      onChange={setAddDraft}
                      onCancel={() => setShowAdd(false)}
                      onSubmit={() => void handleAdd()}
                      saving={saving}
                      submitLabel="Add zone"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openAddZone}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-xs text-zinc-400 hover:border-emerald-400/30 hover:text-emerald-200"
                  >
                    <Plus size={14} />
                    Add zone ({isDining ? "dining room, patio…" : "VIP room, floor, area…"})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function SectionForm({
  draft,
  unitLabels,
  showTableCapacity,
  onChange,
  onCancel,
  onSubmit,
  saving,
  submitLabel,
}: {
  draft: SectionDraft;
  unitLabels: GamingOffering["unitLabels"];
  showTableCapacity?: boolean;
  onChange: (d: SectionDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const perRowLabel =
    unitLabels.plural === "tables"
      ? "Tables per row"
      : unitLabels.plural === "lanes"
        ? "Lanes per row"
        : "Seats per row";
  const countLabel = unitLabels.createCountLabel;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          Zone name
        </span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="VIP room, Main hall, 2nd floor PC…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Floor
          </span>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.floor}
            onChange={(e) => onChange({ ...draft, floor: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {perRowLabel}
          </span>
          <input
            type="number"
            min={2}
            max={12}
            value={draft.seatsPerRow}
            onChange={(e) =>
              onChange({ ...draft, seatsPerRow: e.target.value })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {countLabel}
          </span>
          <input
            type="number"
            min={0}
            max={120}
            value={draft.seatCount}
            onChange={(e) => onChange({ ...draft, seatCount: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {showTableCapacity ? (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Default seats per table
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={draft.defaultTableCapacity}
            onChange={(e) =>
              onChange({ ...draft, defaultTableCapacity: e.target.value })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <span className="mt-1 block text-[10px] text-zinc-600">
            Applied when creating tables in this zone. You can edit individual
            tables later.
          </span>
        </label>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={draft.isVip}
          onChange={(e) => onChange({ ...draft, isVip: e.target.checked })}
          className="rounded border-white/20 bg-zinc-950"
        />
        <Crown size={14} className="text-amber-400/80" />
        VIP zone
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50",
          )}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
