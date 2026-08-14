"use client";

import {
  Building2,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { DiningCollapsible } from "@/components/dining/dining-collapsible";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { cn } from "@/lib/cn";
import {
  DINING_TABLE_SIZES,
  diningTableGroupLabel,
  normalizeDiningTableSize,
} from "@/lib/dining-layout";
import {
  createDiningTableGroup,
  deleteDiningTableGroup,
  updateDiningTableGroup,
  updateGamingSection,
  uploadDiningTableGroupImage,
  type DiningTableGroupDetail,
  type GamingSectionDetail,
} from "@/lib/gaming-layout-client";
import {
  RESOURCE_IMAGE_ACCEPT,
  validateResourceImageFile,
} from "@/lib/image-upload";
import { resolveMediaUrl } from "@/lib/media-url";
import type { SeatingZone } from "@/lib/seating-zone";
import { seatingZoneLabel } from "@/lib/seating-zone";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT } from "@/lib/staff-floor-i18n";
import "./dining-layout.css";

type TableGroupDraft = {
  name: string;
  capacity: string;
  tableCount: string;
  tablesPerRow: string;
  description: string;
};

const EMPTY_GROUP: TableGroupDraft = {
  name: "",
  capacity: "4",
  tableCount: "2",
  tablesPerRow: "4",
  description: "",
};

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function groupToDraft(group: DiningTableGroupDetail): TableGroupDraft {
  return {
    name: group.name ?? "",
    capacity: String(group.capacity),
    tableCount: String(group.tableCount),
    tablesPerRow: String(group.seatsPerRow || 4),
    description: group.description ?? "",
  };
}

export function DiningAreaDetail({
  section,
  floors,
  onBack,
  onUpdated,
}: {
  section: GamingSectionDetail;
  floors: number[];
  onBack: () => void;
  onUpdated: (sections: GamingSectionDetail[]) => void;
}) {
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const [areaName, setAreaName] = useState(section.name);
  const [areaFloor, setAreaFloor] = useState(String(section.floor));
  const [areaZone, setAreaZone] = useState<SeatingZone>(
    section.zone === "OUTDOOR" ? "OUTDOOR" : "INDOOR",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [addDraft, setAddDraft] = useState<TableGroupDraft>(EMPTY_GROUP);
  const [addImage, setAddImage] = useState<File | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TableGroupDraft>(EMPTY_GROUP);
  const [editImage, setEditImage] = useState<File | null>(null);

  const groups = section.tableGroups ?? [];
  const totalTables = section.seatCount;
  const floorLabel =
    section.floor === 1
      ? t("diningSetup.groundFloorOption")
      : t("diningSetup.floorOption", { n: section.floor });

  useEffect(() => {
    setAreaName(section.name);
    setAreaFloor(String(section.floor));
    setAreaZone(section.zone === "OUTDOOR" ? "OUTDOOR" : "INDOOR");
  }, [section.id, section.name, section.floor, section.zone]);

  async function saveAreaSettings() {
    if (!areaName.trim()) {
      setError(t("diningSetup.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await updateGamingSection(section.id, {
        expectedVersion: section.version,
        name: areaName.trim(),
        floor: Number(areaFloor) || 1,
        zone: areaZone,
      });
      onUpdated(data.sections);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diningSetup.saveAreaError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGroup() {
    const count = parseInt(addDraft.tableCount, 10);
    if (!count || count < 1) {
      setError(t("diningSetup.addAtLeastOneTable"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const capacity = normalizeDiningTableSize(addDraft.capacity);
      const data = await createDiningTableGroup({
        sectionId: section.id,
        capacity,
        tableCount: count,
        name: addDraft.name.trim() || undefined,
        description: addDraft.description.trim() || undefined,
        seatsPerRow: Number(addDraft.tablesPerRow) || 4,
      });
      const updatedSection = data.sections.find((s) => s.id === section.id);
      const created = updatedSection?.tableGroups?.at(-1);
      if (created && addImage) {
        const withImage = await uploadDiningTableGroupImage(created.id, addImage);
        onUpdated(withImage.sections);
      } else {
        onUpdated(data.sections);
      }
      setShowAddGroup(false);
      setAddDraft(EMPTY_GROUP);
      setAddImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diningSetup.addTablesError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateGroup(groupId: string) {
    const count = parseInt(editDraft.tableCount, 10);
    if (Number.isNaN(count) || count < 0) {
      setError(t("diningSetup.invalidTableCount"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const capacity = normalizeDiningTableSize(editDraft.capacity);
      const data = await updateDiningTableGroup(groupId, {
        capacity,
        tableCount: count,
        name: editDraft.name.trim() || `${capacity}-seat table`,
        description: editDraft.description.trim() || null,
        seatsPerRow: Number(editDraft.tablesPerRow) || 4,
      });
      if (editImage) {
        const withImage = await uploadDiningTableGroupImage(groupId, editImage);
        onUpdated(withImage.sections);
      } else {
        onUpdated(data.sections);
      }
      setEditingGroupId(null);
      setEditImage(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("diningSetup.updateTablesError"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm(t("diningSetup.deleteTableTypeConfirm"))) return;
    setSaving(true);
    setError(null);
    try {
      const data = await deleteDiningTableGroup(groupId);
      onUpdated(data.sections);
      if (editingGroupId === groupId) setEditingGroupId(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("diningSetup.deleteTableTypeError"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="dining-area-subheader">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex min-h-[2.25rem] items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft size={16} />
          {t("diningSetup.backToAreas")}
        </button>
        <h3 className="truncate text-base font-semibold text-white sm:text-lg">
          {section.name}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {seatingZoneLabel(t, section.zone)} · {floorLabel} ·{" "}
          {totalTables === 1
            ? t("diningSetup.tableCountOne", { n: totalTables })
            : t("diningSetup.tableCountMany", { n: totalTables })}
        </p>
      </div>

      <div className="dining-shell__body flex-1">
        {error ? <FeedbackBanner variant="error" message={error} className="mb-4" /> : null}

        <DiningCollapsible
          title={t("diningSetup.areaSettingsTitle")}
          meta={`${areaName.trim() || section.name} · ${seatingZoneLabel(t, areaZone)} · ${
            Number(areaFloor) === 1
              ? t("diningSetup.ground")
              : t("diningSetup.floorOption", { n: areaFloor })
          }`}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <label className="dining-field block">
              <span>{t("diningSetup.areaNameLabel")}</span>
              <input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="dining-field block">
                <span>{t("diningSetup.floorField")}</span>
                <select
                  value={areaFloor}
                  onChange={(e) => setAreaFloor(e.target.value)}
                >
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      {f === 1
                        ? t("diningSetup.groundFloorOption")
                        : t("diningSetup.floorOption", { n: f })}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {t("diningSetup.locationLabel")}
                </span>
                <div className="dining-zone-toggle mt-1.5">
                  {(["INDOOR", "OUTDOOR"] as SeatingZone[]).map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setAreaZone(zone)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-lg border",
                        areaZone === zone
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                          : "border-white/10 text-zinc-400",
                      )}
                    >
                      {zone === "OUTDOOR" ? <Sun size={14} /> : <Building2 size={14} />}
                      {seatingZoneLabel(t, zone)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAreaSettings()}
              className="min-h-[2.75rem] rounded-lg bg-zinc-800 px-4 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              {t("diningSetup.saveAreaSettings")}
            </button>
          </div>
        </DiningCollapsible>

        <DiningCollapsible
          title={t("diningSetup.tableTypesTitle")}
          meta={
            groups.length === 0
              ? t("diningSetup.tableTypesEmptyMeta")
              : groups.length === 1
                ? t("diningSetup.tableTypesMetaOne", {
                    n: groups.length,
                    total: totalTables,
                  })
                : t("diningSetup.tableTypesMetaMany", {
                    n: groups.length,
                    total: totalTables,
                  })
          }
          badge={groups.length ? String(groups.length) : undefined}
          defaultOpen
          trailing={
            !showAddGroup ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddGroup(true);
                  setAddDraft(EMPTY_GROUP);
                  setAddImage(null);
                  setEditingGroupId(null);
                }}
                className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 text-[11px] text-amber-200 hover:bg-amber-500/20"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">{t("common.add")}</span>
              </button>
            ) : null
          }
        >
          {groups.length === 0 && !showAddGroup ? (
            <p className="rounded-lg border border-dashed border-white/15 p-5 text-center text-sm text-zinc-500">
              {t("diningSetup.noTablesYet")}
            </p>
          ) : (
            <ul className="space-y-2">
              {groups.map((group) => {
                const label = diningTableGroupLabel(
                  group.name,
                  group.capacity,
                  t,
                );
                const isEditing = editingGroupId === group.id;

                if (isEditing) {
                  return (
                    <li
                      key={group.id}
                      className="rounded-lg border border-amber-400/25 bg-amber-500/5 p-3 sm:p-4"
                    >
                      <TableGroupForm
                        t={t}
                        draft={editDraft}
                        imageFile={editImage}
                        existingImageUrl={group.imageUrl}
                        onChange={setEditDraft}
                        onImageChange={setEditImage}
                        onCancel={() => {
                          setEditingGroupId(null);
                          setEditImage(null);
                        }}
                        onSubmit={() => void handleUpdateGroup(group.id)}
                        saving={saving}
                        submitLabel={t("diningSetup.saveTableType")}
                      />
                    </li>
                  );
                }

                return (
                  <li key={group.id}>
                    <TableGroupCollapsible
                      t={t}
                      group={group}
                      label={label}
                      saving={saving}
                      onEdit={() => {
                        setEditingGroupId(group.id);
                        setEditDraft(groupToDraft(group));
                        setEditImage(null);
                        setShowAddGroup(false);
                      }}
                      onDelete={() => void handleDeleteGroup(group.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {showAddGroup ? (
            <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/5 p-3 sm:p-4">
              <p className="mb-3 text-xs font-medium text-amber-200">
                {t("diningSetup.newTableType")}
              </p>
              <TableGroupForm
                t={t}
                draft={addDraft}
                imageFile={addImage}
                onChange={setAddDraft}
                onImageChange={setAddImage}
                onCancel={() => {
                  setShowAddGroup(false);
                  setAddImage(null);
                }}
                onSubmit={() => void handleAddGroup()}
                saving={saving}
                submitLabel={t("diningSetup.addTables")}
              />
            </div>
          ) : groups.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setShowAddGroup(true);
                setAddDraft(EMPTY_GROUP);
                setAddImage(null);
              }}
              className="mt-3 inline-flex w-full min-h-[2.75rem] items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-sm text-zinc-400 hover:border-amber-400/30 hover:text-amber-200 md:hidden"
            >
              <Plus size={16} />
              {t("diningSetup.addAnotherTableType")}
            </button>
          ) : null}
        </DiningCollapsible>
      </div>
    </div>
  );
}

function TableGroupCollapsible({
  t,
  group,
  label,
  saving,
  onEdit,
  onDelete,
}: {
  t: Translate;
  group: DiningTableGroupDetail;
  label: string;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imageSrc = resolveMediaUrl(group.imageUrl);
  const summary = t("diningSetup.tableSummary", {
    count: group.tableCount,
    capacity: group.capacity,
  });

  return (
    <DiningCollapsible
      title={label}
      meta={group.description?.trim() || summary}
      badge={t("diningSetup.seatsBadge", { n: group.capacity })}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="dining-table-thumb">
          {imageSrc ? (
            <Image src={imageSrc} alt="" fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">
              {t("diningSetup.noPhoto")}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-zinc-400">
            {group.tableCount === 1
              ? t("diningSetup.groupDetailOne", {
                  count: group.tableCount,
                  capacity: group.capacity,
                  row: group.seatsPerRow,
                })
              : t("diningSetup.groupDetailMany", {
                  count: group.tableCount,
                  capacity: group.capacity,
                  row: group.seatsPerRow,
                })}
          </p>
          {group.description ? (
            <p className="text-sm leading-relaxed text-zinc-500">{group.description}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/5 sm:min-h-0"
            >
              <Pencil size={13} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onDelete}
              className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 sm:min-h-0"
            >
              <Trash2 size={13} />
              {t("common.remove")}
            </button>
          </div>
        </div>
      </div>
    </DiningCollapsible>
  );
}

function TableGroupForm({
  t,
  draft,
  imageFile,
  existingImageUrl,
  onChange,
  onImageChange,
  onCancel,
  onSubmit,
  saving,
  submitLabel,
}: {
  t: Translate;
  draft: TableGroupDraft;
  imageFile?: File | null;
  existingImageUrl?: string | null;
  onChange: (d: TableGroupDraft) => void;
  onImageChange: (f: File | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const preview = imageFile
    ? URL.createObjectURL(imageFile)
    : resolveMediaUrl(existingImageUrl ?? null);

  return (
    <div className="space-y-3">
      <label className="dining-field block">
        <span>{t("diningSetup.labelOptional")}</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder={t("diningSetup.labelPlaceholder")}
        />
      </label>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {t("diningSetup.seatsPerTable")}
        </span>
        <div className="dining-seats mt-2">
          {DINING_TABLE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onChange({ ...draft, capacity: String(size) })}
              className={cn(
                "dining-seats__btn",
                draft.capacity === String(size)
                  ? "border-amber-400/50 bg-amber-500/15 text-amber-100"
                  : "text-zinc-400 hover:border-white/20 hover:text-white",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="dining-field block">
          <span>{t("diningSetup.howManyTables")}</span>
          <input
            type="number"
            min={1}
            max={80}
            value={draft.tableCount}
            onChange={(e) => onChange({ ...draft, tableCount: e.target.value })}
          />
        </label>
        <label className="dining-field block">
          <span>{t("diningSetup.tablesPerRowMap")}</span>
          <input
            type="number"
            min={2}
            max={10}
            value={draft.tablesPerRow}
            onChange={(e) => onChange({ ...draft, tablesPerRow: e.target.value })}
          />
        </label>
      </div>

      <label className="dining-field block">
        <span>{t("diningSetup.descriptionOptional")}</span>
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          rows={2}
          placeholder={t("diningSetup.descriptionPlaceholder")}
        />
      </label>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {t("diningSetup.photoOptional")}
        </span>
        <div className="mt-2 flex items-center gap-3">
          <div className="dining-table-thumb">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">
                {t("diningSetup.noImage")}
              </div>
            )}
          </div>
          <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 text-sm text-amber-300 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:text-xs sm:text-amber-400">
            <Upload size={16} />
            {t("diningSetup.uploadPhoto")}
            <input
              type="file"
              accept={RESOURCE_IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const err = validateResourceImageFile(f);
                  if (err) return;
                  onImageChange(f);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="dining-sticky-actions flex justify-end gap-2 sm:static sm:mt-1 sm:border-0 sm:bg-transparent">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[2.75rem] rounded-lg border border-white/10 px-4 text-sm text-zinc-400 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 sm:min-h-0 sm:px-4 sm:py-2 sm:text-xs"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
