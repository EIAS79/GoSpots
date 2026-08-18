"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { api } from "@/lib/api";
import { hasPermission } from "@/lib/auth-client";
import { useCurrentMembership } from "@/lib/use-current-membership";

type ShiftState = {
  membership: { id: string; name: string };
  schedule?: { id: string; startsAt: string; endsAt: string; jobRoleId: string } | null;
  openPunch?: { id: string; startedAt: string } | null;
  openBreak?: { id: string; startedAt: string; paid: boolean } | null;
};
type Roster = {
  memberships: { id: string; name: string; email: string }[];
  roles: { id: string; name: string }[];
};
type Adjustment = { id: string; timePunchId: string; reason: string; createdAt: string };
type RecordRow = {
  id: string;
  membershipId: string;
  startedAt: string;
  endedAt?: string | null;
  workedSeconds: number;
  hourlyRateMinor?: number;
  currency?: string;
  laborCostMinor?: number;
};
type Labor = {
  days: number;
  revenue: number;
  laborHours: number;
  laborCostMinor: number;
  revenuePerLaborHour: number;
};
type PlannedShift = {
  id: string;
  membershipId: string;
  employeeName: string;
  jobRoleId: string;
  jobRoleName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  published: boolean;
  publishedAt: string | null;
  absenceStatus: string | null;
  absenceReason: string | null;
  note: string | null;
};

const tabs = ["My Shift", "Schedule", "Time records", "Adjustments", "Labor"] as const;
type Tab = (typeof tabs)[number];

export default function WorkforcePage() {
  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const canManage = membership?.role === "OWNER" || hasPermission(perms, "staff.write");
  const canLabor = membership?.role === "OWNER";
  const [tab, setTab] = useState<Tab>("My Shift");
  const [shift, setShift] = useState<ShiftState | null>(null);
  const [roster, setRoster] = useState<Roster>({ memberships: [], roles: [] });
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [planned, setPlanned] = useState<PlannedShift[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [labor, setLabor] = useState<Labor | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, r, recs] = await Promise.all([
        api<ShiftState>("/workforce/my-shift"),
        api<Roster>("/workforce/roster"),
        api<RecordRow[]>("/workforce/time-records"),
      ]);
      setShift(s);
      setRoster(r);
      setRecords(recs);
      if (canManage) {
        const [pending, scheduleRows] = await Promise.all([
          api<Adjustment[]>("/workforce/adjustments/pending"),
          api<PlannedShift[]>("/workforce/phase10/schedule?days=60"),
        ]);
        setAdjustments(pending);
        setPlanned(scheduleRows);
      }
      if (canLabor) setLabor(await api<Labor>("/workforce/reports/labor?days=30"));
      setMsg("");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Workforce unavailable");
    }
  }, [canManage, canLabor]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = new Map(roster.roles.map((role) => [role.id, role.name]));

  async function action(path: string, body?: unknown) {
    try {
      await api(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function schedule() {
    const employee = window.prompt(
      "Employee membership ID",
      roster.memberships[0]?.id ?? "",
    );
    const role = window.prompt("Job role ID", roster.roles[0]?.id ?? "");
    const start = window.prompt(
      "Start ISO time",
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    const end = window.prompt(
      "End ISO time",
      new Date(Date.now() + 9 * 3_600_000).toISOString(),
    );
    if (employee && role && start && end) {
      await action("/workforce/schedule", {
        membershipId: employee,
        jobRoleId: role,
        startsAt: start,
        endsAt: end,
      });
    }
  }

  async function markAbsence(row: PlannedShift) {
    const status = window.prompt(
      "Absence status: ABSENT, EXCUSED, NO_SHOW, or blank to clear",
      row.absenceStatus ?? "",
    );
    if (status === null) return;
    const normalized = status.trim().toUpperCase();
    if (normalized && !["ABSENT", "EXCUSED", "NO_SHOW"].includes(normalized)) {
      setMsg("Absence status must be ABSENT, EXCUSED, NO_SHOW, or blank.");
      return;
    }
    const reason = normalized
      ? window.prompt("Absence reason (optional)", row.absenceReason ?? "") ?? ""
      : null;
    await action(`/workforce/phase10/schedule/${row.id}/absence`, {
      status: normalized || null,
      reason,
    });
  }

  const visibleTabs = useMemo(
    () =>
      tabs.filter(
        (item) =>
          ((item !== "Schedule" && item !== "Adjustments") || canManage) &&
          (item !== "Labor" || canLabor),
      ),
    [canManage, canLabor],
  );

  return (
    <TenantPage
      title="Workforce"
      description="Scheduling, time clock, adjustments and labor analytics with effective-dated wage history."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`min-h-11 rounded-lg px-4 ${
                tab === item ? "bg-emerald-400 text-zinc-950" : "border border-zinc-700"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {msg ? (
          <div className="rounded-lg border border-red-500/40 p-3 text-sm text-red-200">
            {msg}
          </div>
        ) : null}

        {tab === "My Shift" && shift ? (
          <section className="max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="text-xl font-semibold">{shift.membership.name}</h2>
            {shift.schedule ? (
              <p className="mt-2 text-sm text-zinc-400">
                Scheduled {new Date(shift.schedule.startsAt).toLocaleString()} – {new Date(shift.schedule.endsAt).toLocaleTimeString()} · {roles.get(shift.schedule.jobRoleId) ?? "Role"}
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No nearby scheduled shift.</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {!shift.openPunch ? (
                <button
                  type="button"
                  onClick={() =>
                    void action("/workforce/clock-in", {
                      scheduleEntryId: shift.schedule?.id,
                      jobRoleId: shift.schedule?.jobRoleId,
                    })
                  }
                  className="min-h-16 rounded-xl bg-emerald-400 text-lg font-bold text-zinc-950"
                >
                  Clock In
                </button>
              ) : null}
              {shift.openPunch && !shift.openBreak ? (
                <button
                  type="button"
                  onClick={() => void action("/workforce/break/start", { paid: false })}
                  className="min-h-16 rounded-xl bg-amber-400 text-lg font-bold text-zinc-950"
                >
                  Start Break
                </button>
              ) : null}
              {shift.openBreak ? (
                <button
                  type="button"
                  onClick={() => void action("/workforce/break/end")}
                  className="min-h-16 rounded-xl bg-sky-400 text-lg font-bold text-zinc-950"
                >
                  End Break
                </button>
              ) : null}
              {shift.openPunch && !shift.openBreak ? (
                <button
                  type="button"
                  onClick={() => void action("/workforce/clock-out")}
                  className="min-h-16 rounded-xl border border-red-500/60 text-lg font-bold text-red-200"
                >
                  Clock Out
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "Schedule" && canManage ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Planned shifts</h2>
                <p className="text-sm text-zinc-500">
                  Overlapping active shifts are rejected. Publish state and absences are explicit and audited.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void schedule()}
                className="min-h-11 rounded-lg bg-emerald-400 px-4 font-semibold text-zinc-950"
              >
                Add shift
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-left">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Start</th>
                    <th className="p-3">End</th>
                    <th className="p-3">Published</th>
                    <th className="p-3">Absence</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {planned.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-800">
                      <td className="p-3">{row.employeeName}</td>
                      <td className="p-3">{row.jobRoleName}</td>
                      <td className="p-3">{new Date(row.startsAt).toLocaleString()}</td>
                      <td className="p-3">{new Date(row.endsAt).toLocaleString()}</td>
                      <td className="p-3">{row.published ? "Published" : "Draft"}</td>
                      <td className="p-3">
                        {row.absenceStatus ?? "—"}
                        {row.absenceReason ? (
                          <span className="block text-xs text-zinc-500">{row.absenceReason}</span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void action(`/workforce/phase10/schedule/${row.id}/publish`, {
                                published: !row.published,
                              })
                            }
                            className="min-h-11 rounded-lg border border-emerald-500/50 px-3"
                          >
                            {row.published ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void markAbsence(row)}
                            className="min-h-11 rounded-lg border border-amber-500/50 px-3"
                          >
                            {row.absenceStatus ? "Edit absence" : "Mark absence"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "Time records" ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Clock in</th>
                  <th className="p-3">Clock out</th>
                  <th className="p-3">Worked</th>
                  {canLabor ? <th className="p-3">Labor cost</th> : null}
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="p-3">
                      {roster.memberships.find((member) => member.id === row.membershipId)?.name ?? row.membershipId.slice(-6)}
                    </td>
                    <td className="p-3">{new Date(row.startedAt).toLocaleString()}</td>
                    <td className="p-3">{row.endedAt ? new Date(row.endedAt).toLocaleString() : "Open"}</td>
                    <td className="p-3">{(row.workedSeconds / 3600).toFixed(2)} h</td>
                    {canLabor ? (
                      <td className="p-3">
                        {((row.laborCostMinor ?? 0) / 100).toFixed(2)} {row.currency ?? ""}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "Adjustments" && canManage ? (
          <div className="space-y-2">
            {adjustments.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 p-4"
              >
                <div>
                  <strong>{row.reason}</strong>
                  <p className="text-xs text-zinc-500">
                    Punch {row.timePunchId.slice(-6)} · {new Date(row.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void action(`/workforce/adjustments/${row.id}/decision`, {
                        approve: false,
                        note: "Manager rejected",
                      })
                    }
                    className="min-h-11 rounded-lg border border-red-500/50 px-3 text-red-200"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void action(`/workforce/adjustments/${row.id}/decision`, {
                        approve: true,
                        note: "Manager approved",
                      })
                    }
                    className="min-h-11 rounded-lg bg-emerald-400 px-3 font-semibold text-zinc-950"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "Labor" && canLabor && labor ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Finance revenue", labor.revenue.toFixed(2)],
              ["Labor hours", labor.laborHours.toFixed(2)],
              ["Labor cost", (labor.laborCostMinor / 100).toFixed(2)],
              ["Revenue / labor hour", labor.revenuePerLaborHour.toFixed(2)],
            ].map(([key, value]) => (
              <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs text-zinc-500">{key}</p>
                <strong className="mt-1 block text-xl">{value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </TenantPage>
  );
}