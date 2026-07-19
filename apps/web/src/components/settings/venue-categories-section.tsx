"use client";

import { Loader2, Plus, Sparkles, Tags, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  fetchShopSettings,
  syncVenueCategories,
  type VenueCategoryPreset,
  type VenueCategoryTag,
} from "@/lib/shop-settings-client";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function VenueCategoriesSection({ canWrite = true }: { canWrite?: boolean }) {
  const { t } = useVenueSettings();
  const [presets, setPresets] = useState<VenueCategoryPreset[]>([]);
  const [selected, setSelected] = useState<VenueCategoryTag[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchShopSettings()
      .then((d) => {
        setPresets(d.venueCategoryPresets ?? []);
        setSelected(d.venueCategories ?? []);
        setSelectedSlugs(new Set((d.venueCategories ?? []).map((t) => t.slug)));
      })
      .catch(() => setError("Could not load categories."))
      .finally(() => setLoading(false));
  }, []);

  async function persist(nextSlugs: Set<string>, customTags: VenueCategoryTag[]) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const presetSlugs = [...nextSlugs].filter((slug) =>
      presets.some((p) => p.slug === slug),
    );
    const custom = customTags
      .filter((t) => !presets.some((p) => p.slug === t.slug))
      .map((t) => ({ name: t.name, color: t.color ?? undefined }));
    try {
      const data = await syncVenueCategories({ presetSlugs, custom });
      setSelected(data.venueCategories ?? []);
      setSelectedSlugs(new Set((data.venueCategories ?? []).map((t) => t.slug)));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save categories.");
    } finally {
      setSaving(false);
    }
  }

  function togglePreset(slug: string) {
    if (!canWrite) return;
    const next = new Set(selectedSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedSlugs(next);
    void persist(next, selected);
  }

  function removeTag(slug: string) {
    if (!canWrite) return;
    const next = new Set(selectedSlugs);
    next.delete(slug);
    const nextSelected = selected.filter((t) => t.slug !== slug);
    setSelected(nextSelected);
    setSelectedSlugs(next);
    void persist(next, nextSelected);
  }

  function addCustom() {
    if (!canWrite) return;
    const name = customName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug || selectedSlugs.has(slug)) return;
    const tag: VenueCategoryTag = {
      id: `custom-${slug}`,
      name,
      slug,
      color: "#fbbf24",
    };
    const nextSelected = [...selected, tag];
    const nextSlugs = new Set(selectedSlugs);
    nextSlugs.add(slug);
    setSelected(nextSelected);
    setSelectedSlugs(nextSlugs);
    setCustomName("");
    void persist(nextSlugs, nextSelected);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 shadow-lg shadow-black/20">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-300">
          <Tags size={18} />
          <h2 className="font-semibold text-white">{t("settings.categories")}</h2>
        </div>
        {saving ? (
          <span className="text-xs text-zinc-500">{t("common.saving")}</span>
        ) : saved ? (
          <span className="text-xs text-emerald-400">{t("common.saved")}</span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-zinc-500">{t("settings.categoriesHint")}</p>

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {selected.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => removeTag(tag.slug)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-950/80 py-1 pl-3 pr-2 text-xs font-medium text-zinc-200 transition hover:border-rose-500/40"
              style={{
                borderColor: tag.color ? `${tag.color}55` : undefined,
                boxShadow: tag.color ? `0 0 12px ${tag.color}33` : undefined,
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tag.color ?? "#fbbf24" }}
              />
              {tag.name}
              <X size={12} className="text-zinc-500" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = selectedSlugs.has(p.slug);
          return (
            <button
              key={p.slug}
              type="button"
              disabled={saving || !canWrite}
              onClick={() => togglePreset(p.slug)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                on
                  ? "border-amber-400/50 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-zinc-950/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
              )}
              style={
                on
                  ? { boxShadow: `0 0 16px ${p.color}44` }
                  : undefined
              }
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {canWrite ? (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
        <div className="flex min-w-0 w-full flex-1 items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 sm:min-w-[200px]">
          <Sparkles size={14} className="shrink-0 text-amber-400/80" />
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder={t("settings.categoriesPlaceholder")}
            disabled={saving}
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
          />
        </div>
        <button
          type="button"
          disabled={saving || !customName.trim()}
          onClick={addCustom}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-40"
        >
          <Plus size={16} />
          {t("common.add")}
        </button>
      </div>
      ) : null}
    </section>
  );
}
