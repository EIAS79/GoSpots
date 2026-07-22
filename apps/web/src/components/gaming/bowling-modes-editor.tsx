"use client";

import { Plus, X } from "lucide-react";
import { useMemo } from "react";
import {
  FULL_DAY_DURATION_MINUTES,
  GAMING_PRICE_PRESETS,
} from "@/lib/gaming-menu-client";
import {
  createBowlingMode,
  defaultBowlingModeName,
  type BowlingModeDefinition,
} from "@/lib/bowling-modes";
import type { BowlingChargeMode } from "@/lib/bowling-booking";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT } from "@/lib/staff-floor-i18n";

type RateRow = { label: string; durationMinutes: string; price: string };

export type BowlingModeDraft = {
  id: string;
  name: string;
  chargeType: BowlingChargeMode;
  slotMinutes: string;
  pricePerPerson: string;
  pricePerGame: string;
  defaultGames: string;
  minutesPerGame: string;
  minPlayers: string;
  maxPlayers: string;
  rates: RateRow[];
};

export function bowlingModeToDraft(mode: BowlingModeDefinition): BowlingModeDraft {
  return {
    id: mode.id,
    name: mode.name,
    chargeType: mode.chargeType,
    slotMinutes: String(mode.slotMinutes),
    pricePerPerson:
      mode.pricePerPerson != null ? String(mode.pricePerPerson) : "",
    pricePerGame: mode.pricePerGame != null ? String(mode.pricePerGame) : "",
    defaultGames: String(mode.defaultGames),
    minutesPerGame:
      mode.minutesPerGame != null ? String(mode.minutesPerGame) : "",
    minPlayers: String(mode.minPlayers),
    maxPlayers: String(mode.maxPlayers),
    rates: mode.rates.length
      ? mode.rates.map((r) => ({
          label: r.label,
          durationMinutes:
            r.durationMinutes != null ? String(r.durationMinutes) : "",
          price: String(r.price),
        }))
      : [{ label: "Per hour", durationMinutes: String(mode.slotMinutes), price: "" }],
  };
}

export function draftToBowlingMode(draft: BowlingModeDraft): BowlingModeDefinition {
  return {
    id: draft.id,
    name: draft.name.trim() || defaultBowlingModeName(draft.chargeType),
    chargeType: draft.chargeType,
    slotMinutes: Math.max(15, parseInt(draft.slotMinutes, 10) || 60),
    pricePerPerson: draft.pricePerPerson
      ? parseFloat(draft.pricePerPerson) || null
      : null,
    pricePerGame: draft.pricePerGame
      ? parseFloat(draft.pricePerGame) || null
      : null,
    defaultGames: Math.max(1, parseInt(draft.defaultGames, 10) || 1),
    minutesPerGame: draft.minutesPerGame
      ? parseInt(draft.minutesPerGame, 10) || null
      : null,
    minPlayers: Math.max(1, parseInt(draft.minPlayers, 10) || 1),
    maxPlayers: Math.max(1, parseInt(draft.maxPlayers, 10) || 6),
    rates: draft.rates
      .filter((r) => r.label.trim() && r.price.trim())
      .map((r) => ({
        label: r.label.trim(),
        durationMinutes: r.durationMinutes
          ? parseInt(r.durationMinutes, 10)
          : null,
        price: parseFloat(r.price) || 0,
      })),
  };
}

export function BowlingModesEditor({
  modes,
  onChange,
  defaultSlotMinutes,
}: {
  modes: BowlingModeDraft[];
  onChange: (modes: BowlingModeDraft[]) => void;
  defaultSlotMinutes: number;
}) {
  const vs = useVenueSettingsOptional();
  const currency = vs?.currency ?? "EUR";
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  function updateMode(index: number, patch: Partial<BowlingModeDraft>) {
    const next = [...modes];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addMode(chargeType: BowlingChargeMode) {
    onChange([...modes, bowlingModeToDraft(createBowlingMode(chargeType, defaultSlotMinutes))]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-zinc-300">
            {t("gamingSetup.bowling.title")}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-600">
            {t("gamingSetup.bowling.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["TIME", "PERSON", "GAME"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addMode(t)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/5"
            >
              <Plus size={10} />
              {defaultBowlingModeName(t)}
            </button>
          ))}
        </div>
      </div>

      {modes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-zinc-500">
          {t("gamingSetup.bowling.emptyHint")}
        </p>
      ) : null}

      {modes.map((mode, index) => (
        <div
          key={mode.id}
          className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.modeNameLabel")}
                <input
                  value={mode.name}
                  onChange={(e) => updateMode(index, { name: e.target.value })}
                  placeholder={defaultBowlingModeName(mode.chargeType)}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
                />
              </label>
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.pricingTypeLabel")}
                <select
                  value={mode.chargeType}
                  onChange={(e) =>
                    updateMode(index, {
                      chargeType: e.target.value as BowlingChargeMode,
                      name: defaultBowlingModeName(
                        e.target.value as BowlingChargeMode,
                      ),
                    })
                  }
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
                >
                  <option value="TIME">
                    {t("gamingSetup.bowling.chargeTypeTime")}
                  </option>
                  <option value="PERSON">
                    {t("gamingSetup.bowling.chargeTypePerson")}
                  </option>
                  <option value="GAME">
                    {t("gamingSetup.bowling.chargeTypeGame")}
                  </option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={modes.length <= 1}
              onClick={() => onChange(modes.filter((_, i) => i !== index))}
              className="rounded p-1 text-zinc-500 hover:text-rose-300 disabled:opacity-30"
              aria-label={t("gamingSetup.bowling.removeMode")}
            >
              <X size={14} />
            </button>
          </div>

          <label className="block text-[10px] text-zinc-500">
            {t("gamingSetup.bowling.slotMinutesLabel")}
            <input
              type="number"
              min={15}
              value={mode.slotMinutes}
              onChange={(e) => updateMode(index, { slotMinutes: e.target.value })}
              className="mt-0.5 w-full max-w-[8rem] rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
            />
          </label>

          {mode.chargeType === "PERSON" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.pricePerPerson", { currency })}
                <input
                  value={mode.pricePerPerson}
                  onChange={(e) =>
                    updateMode(index, { pricePerPerson: e.target.value })
                  }
                  placeholder="e.g. 20"
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
                />
              </label>
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.minMaxPlayers")}
                <div className="mt-0.5 flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={mode.minPlayers}
                    onChange={(e) =>
                      updateMode(index, { minPlayers: e.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                  />
                  <input
                    type="number"
                    min={1}
                    value={mode.maxPlayers}
                    onChange={(e) =>
                      updateMode(index, { maxPlayers: e.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                  />
                </div>
              </label>
            </div>
          ) : null}

          {mode.chargeType === "GAME" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.pricePerGame", { currency })}
                <input
                  value={mode.pricePerGame}
                  onChange={(e) =>
                    updateMode(index, { pricePerGame: e.target.value })
                  }
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
                />
              </label>
              <label className="block text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.minutesPerGame")}
                <input
                  type="number"
                  min={1}
                  value={mode.minutesPerGame}
                  onChange={(e) =>
                    updateMode(index, { minutesPerGame: e.target.value })
                  }
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
                />
              </label>
            </div>
          ) : null}

          {mode.chargeType === "TIME" ? (
            <div>
              <p className="text-[10px] text-zinc-500">
                {t("gamingSetup.bowling.laneRatesLabel")}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {GAMING_PRICE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      updateMode(index, {
                        rates: [
                          ...mode.rates,
                          {
                            label: p.label,
                            durationMinutes:
                              p.durationMinutes != null
                                ? String(p.durationMinutes)
                                : "",
                            price: "",
                          },
                        ],
                      })
                    }
                    className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-white/5"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
              <ul className="mt-2 space-y-1.5">
                {mode.rates.map((r, ri) => (
                  <li key={ri} className="flex flex-wrap items-center gap-1.5">
                    <input
                      placeholder={t("gamingSetup.bowling.rateLabelPlaceholder")}
                      value={r.label}
                      onChange={(e) => {
                        const rates = [...mode.rates];
                        rates[ri] = { ...r, label: e.target.value };
                        updateMode(index, { rates });
                      }}
                      className="min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                    />
                    <input
                      placeholder={t("gamingSetup.bowling.rateMinPlaceholder")}
                      value={r.durationMinutes}
                      onChange={(e) => {
                        const rates = [...mode.rates];
                        rates[ri] = { ...r, durationMinutes: e.target.value };
                        updateMode(index, { rates });
                      }}
                      className="w-14 rounded border border-white/10 bg-zinc-900 px-1 py-1 text-xs text-white"
                    />
                    <input
                      placeholder={t("gamingSetup.bowling.ratePricePlaceholder", {
                        currency,
                      })}
                      value={r.price}
                      onChange={(e) => {
                        const rates = [...mode.rates];
                        rates[ri] = { ...r, price: e.target.value };
                        updateMode(index, { rates });
                      }}
                      className="w-16 rounded border border-white/10 bg-zinc-900 px-1 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={mode.rates.length <= 1}
                      onClick={() =>
                        updateMode(index, {
                          rates: mode.rates.filter((_, i) => i !== ri),
                        })
                      }
                      className="text-zinc-500 hover:text-rose-300 disabled:opacity-30"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-zinc-600">
                {t("gamingSetup.bowling.fullDayHint", {
                  min: FULL_DAY_DURATION_MINUTES,
                })}
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
