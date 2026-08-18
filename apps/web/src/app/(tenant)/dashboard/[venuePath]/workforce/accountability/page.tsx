"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { api } from "@/lib/api";
import {
  clearOperatorSession,
  getOperatorSession,
  setOperatorSession,
  type StoredOperatorSession,
} from "@/lib/operator-session";
import { useCurrentMembership } from "@/lib/use-current-membership";

type StaffProfile = {
  membershipId: string;
  displayName: string;
  employeeNumber: string;
  permissionRole: string;
  active: boolean;
  managerMembershipId: string | null;
  jobRoleId: string | null;
  hourlyCost: { minor: number; currency: string } | null;
  assignedBranches: Array<{ shopId: string; name: string; active: boolean }>;
};

type ApprovalPolicy = {
  actionKind: string;
  enabled: boolean;
  amountThresholdMinor: number | null;
  requirePassword: boolean;
  notifyOnUse: boolean;
};

type NotificationRule = {
  actionKind: string;
  enabled: boolean;
  amountThresholdMinor: number | null;
  repeatWindowMinutes: number;
  repeatCountThreshold: number;
  afterHoursStartHour: number | null;
  afterHoursEndHour: number | null;
};

type Approval = {
  id: string;
  actionKind: string;
  requesterMembershipId: string;
  sourceType: string;
  sourceId: string | null;
  reason: string;
  status: string;
  expiresAt: string;
};

type Evidence = {
  id: string;
  actionKind: string;
  actorName: string;
  approverName: string | null;
  authStrength: string;
  suspicious: boolean;
  suspiciousReasons: string[] | null;
  occurredAt: string;
};

type Performance = {
  membershipId: string;
  displayName: string;
  salesCount: number;
  salesMinor: number;
  averageCheckMinor: number;
  refundCount: number;
  voidCount: number;
  discountCount: number;
  workedHours: number;
  overtimeSeconds: number;
  lateCount: number;
  breakComplianceViolations: number;
  exceptionCount: number;
  resourceSessionCount: number;
  cashVariance: string;
  cashVarianceCurrency: string | null;
  cashVarianceCloseCount: number;
  laborCostMinor: number | null;
  laborToSalesBasisPoints: number | null;
  kdsReadyCount: number;
  kdsAverageReadySeconds: number | null;
};

type WorkforcePolicy = {
  enforceSchedule: boolean;
  lateGraceMinutes: number;
  operatorSessionMinutes: number;
  pinLockoutAttempts: number;
  pinLockoutMinutes: number;
  clockInDeviceRequired: boolean;
  clockInAllowedDeviceIds: string[];
  clockInLocationRequired: boolean;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockInRadiusMeters: number;
};

type SwitchResponse = {
  operatorToken: string;
  expiresAt: string;
  authStrength: "PIN" | "BADGE";
  operator: { membershipId: string; displayName: string };
};

const tabs = [
  "Staff",
  "Approvals",
  "Owner controls",
  "Accountability",
  "Performance",
] as const;
type Tab = (typeof tabs)[number];

function formatMinor(value: number | null, currency?: string | null) {
  if (value == null) return "—";
  return `${(value / 100).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function formatCashVariance(value: string, currency?: string | null) {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toFixed(2) : value}${currency ? ` ${currency}` : ""}`;
}

export default function WorkforceAccountabilityPage() {
  const membership = useCurrentMembership();
  const isOwner = membership?.role === "OWNER";
  const canManage =
    isOwner ||
    membership?.role === "MANAGER" ||
    (membership?.permissions ?? "").includes("staff.write");
  const [tab, setTab] = useState<Tab>("Staff");
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [workforcePolicy, setWorkforcePolicy] = useState<WorkforcePolicy | null>(null);
  const [operator, setOperator] = useState<StoredOperatorSession | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [staffRows, policyRows, ruleRows, evidenceRows, performanceRows, timePolicy] =
        await Promise.all([
          api<StaffProfile[]>("/workforce/phase10/staff"),
          api<ApprovalPolicy[]>("/workforce/phase10/approval-policies"),
          api<NotificationRule[]>("/workforce/phase10/notification-rules"),
          api<Evidence[]>("/workforce/phase10/accountability?take=100"),
          api<Performance[]>("/workforce/phase10/performance?days=30"),
          api<WorkforcePolicy>("/workforce/phase10/policy"),
        ]);
      setStaff(staffRows);
      setPolicies(policyRows);
      setNotificationRules(ruleRows);
      setEvidence(evidenceRows);
      setPerformance(performanceRows);
      setWorkforcePolicy(timePolicy);
      if (canManage) {
        setApprovals(
          await api<Approval[]>("/workforce/phase10/approvals?status=PENDING"),
        );
      }
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Phase 10 workforce controls unavailable",
      );
    }
  }, [canManage]);

  useEffect(() => {
    setOperator(getOperatorSession());
    const sync = () => setOperator(getOperatorSession());
    window.addEventListener("gospots:operator-session", sync);
    return () => window.removeEventListener("gospots:operator-session", sync);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const staffNames = useMemo(
    () => new Map(staff.map((row) => [row.membershipId, row.displayName])),
    [staff],
  );

  async function put(path: string, body: unknown) {
    try {
      await api(path, { method: "PUT", body: JSON.stringify(body) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  }

  async function patch(path: string, body: unknown) {
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  }

  async function setPin(row: StaffProfile) {
    const pin = window.prompt(`Set a 4–8 digit operator PIN for ${row.displayName}`) ?? "";
    if (!pin) return;
    await put("/workforce/phase10/operator-credentials", {
      membershipId: row.membershipId,
      pin,
      active: true,
    });
  }

  async function switchOperator(row: StaffProfile) {
    const pin = window.prompt(`Enter operator PIN for ${row.displayName}`) ?? "";
    if (!pin) return;
    try {
      const result = await api<SwitchResponse>("/workforce/phase10/operator-switch", {
        method: "POST",
        body: JSON.stringify({ membershipId: row.membershipId, pin }),
      });
      setOperatorSession({
        token: result.operatorToken,
        membershipId: result.operator.membershipId,
        displayName: result.operator.displayName,
        authStrength: result.authStrength,
        expiresAt: result.expiresAt,
      });
      setMessage(
        `${result.operator.displayName} is now the active counter operator. High-risk actions still require full authenticated identity.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operator switch failed");
    }
  }

  async function decideApproval(row: Approval, approve: boolean) {
    const password = approve
      ? (window.prompt("Confirm your account password for this elevated approval") ?? "")
      : "";
    if (approve && !password) return;
    const note =
      window.prompt(
        approve ? "Approval note (optional)" : "Reason for denial",
        "",
      ) ?? "";
    try {
      await api(`/workforce/phase10/approvals/${row.id}/decision`, {
        method: "POST",
        headers: approve ? { "x-confirm-password": password } : undefined,
        body: JSON.stringify({ approve, note }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval decision failed");
    }
  }

  async function configureGeofence() {
    if (!workforcePolicy) return;
    const latitudeText =
      window.prompt(
        "Clock-in geofence latitude (-90 to 90)",
        workforcePolicy.clockInLatitude?.toString() ?? "",
      ) ?? "";
    if (!latitudeText) return;
    const longitudeText =
      window.prompt(
        "Clock-in geofence longitude (-180 to 180)",
        workforcePolicy.clockInLongitude?.toString() ?? "",
      ) ?? "";
    if (!longitudeText) return;
    const radiusText =
      window.prompt(
        "Allowed clock-in radius in meters (10 to 100000)",
        String(workforcePolicy.clockInRadiusMeters || 100),
      ) ?? "";
    if (!radiusText) return;

    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    const radius = Number(radiusText);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isInteger(radius) ||
      radius < 10 ||
      radius > 100000
    ) {
      setMessage("Invalid geofence coordinates or radius.");
      return;
    }

    await put("/workforce/phase10/policy", {
      clockInLocationRequired: true,
      clockInLatitude: latitude,
      clockInLongitude: longitude,
      clockInRadiusMeters: radius,
    });
  }

  return (
    <TenantPage
      title="Workforce accountability"
      description="Staff identity, quick operator switching, owner approvals, suspicious-action controls and operational employee metrics."
    >
      <div className="space-y-5">
        {operator ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
            <span>
              Active operator: <strong>{operator.displayName}</strong> · {operator.authStrength} ·
              expires {new Date(operator.expiresAt).toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={() => clearOperatorSession()}
              className="min-h-11 rounded-lg border border-sky-400/50 px-3"
            >
              Clear operator
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {tabs
            .filter((item) => item !== "Owner controls" || isOwner)
            .map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`min-h-11 rounded-lg px-4 ${
                  tab === item
                    ? "bg-emerald-400 font-semibold text-zinc-950"
                    : "border border-zinc-700"
                }`}
              >
                {item}
              </button>
            ))}
        </div>

        {message ? (
          <div className="rounded-xl border border-amber-500/40 p-3 text-sm text-amber-100">
            {message}
          </div>
        ) : null}

        {tab === "Staff" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {staff.map((row) => (
              <section
                key={row.membershipId}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{row.displayName}</h2>
                    <p className="text-sm text-zinc-400">
                      {row.employeeNumber} · {row.permissionRole}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      row.active
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {row.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-4 text-sm text-zinc-300">
                  <p>Job role: {row.jobRoleId ?? "Not assigned"}</p>
                  {row.hourlyCost ? (
                    <p>
                      Hourly cost: {(row.hourlyCost.minor / 100).toFixed(2)} {row.hourlyCost.currency}
                    </p>
                  ) : null}
                  <p>
                    Manager: {row.managerMembershipId ? staffNames.get(row.managerMembershipId) ?? row.managerMembershipId : "Not assigned"}
                  </p>
                  <p className="mt-2 text-zinc-500">
                    Branches: {row.assignedBranches.map((branch) => branch.name).join(", ") || "Current venue"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {row.active ? (
                    <button
                      type="button"
                      onClick={() => void switchOperator(row)}
                      className="min-h-11 rounded-lg bg-sky-400 px-3 font-semibold text-zinc-950"
                    >
                      Switch operator
                    </button>
                  ) : null}
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void setPin(row)}
                        className="min-h-11 rounded-lg border border-sky-500/50 px-3 text-sky-200"
                      >
                        Rotate PIN
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void patch(`/workforce/phase10/staff/${row.membershipId}`, {
                            active: !row.active,
                          })
                        }
                        className="min-h-11 rounded-lg border border-zinc-700 px-3"
                      >
                        {row.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {tab === "Approvals" ? (
          <div className="space-y-3">
            {!approvals.length ? (
              <p className="text-sm text-zinc-500">No pending elevated approvals.</p>
            ) : null}
            {approvals.map((row) => (
              <section key={row.id} className="rounded-xl border border-zinc-800 p-4">
                <strong>{row.actionKind}</strong>
                <p className="text-sm text-zinc-400">
                  Requested by {staffNames.get(row.requesterMembershipId) ?? row.requesterMembershipId}
                </p>
                <p className="mt-1 text-sm">{row.reason}</p>
                <p className="text-xs text-zinc-500">
                  {row.sourceType} {row.sourceId ?? ""} · expires {new Date(row.expiresAt).toLocaleString()}
                </p>
                {canManage ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void decideApproval(row, false)}
                      className="min-h-11 rounded-lg border border-red-500/50 px-3 text-red-200"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideApproval(row, true)}
                      className="min-h-11 rounded-lg bg-emerald-400 px-3 font-semibold text-zinc-950"
                    >
                      Approve
                    </button>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}

        {tab === "Owner controls" && isOwner ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-zinc-800 p-5">
              <h2 className="text-lg font-semibold">Time-clock policy</h2>
              {workforcePolicy ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        void put("/workforce/phase10/policy", {
                          enforceSchedule: !workforcePolicy.enforceSchedule,
                        })
                      }
                      className={`min-h-11 rounded-lg px-3 ${
                        workforcePolicy.enforceSchedule
                          ? "bg-emerald-400 text-zinc-950"
                          : "border border-zinc-700"
                      }`}
                    >
                      Enforce schedule: {workforcePolicy.enforceSchedule ? "On" : "Off"}
                    </button>
                    <span>Late grace {workforcePolicy.lateGraceMinutes} min</span>
                    <span>
                      PIN lockout {workforcePolicy.pinLockoutAttempts} attempts / {workforcePolicy.pinLockoutMinutes} min
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        void put("/workforce/phase10/policy", {
                          clockInDeviceRequired: !workforcePolicy.clockInDeviceRequired,
                        })
                      }
                      className={`min-h-11 rounded-lg px-3 ${
                        workforcePolicy.clockInDeviceRequired
                          ? "bg-sky-400 text-zinc-950"
                          : "border border-zinc-700"
                      }`}
                    >
                      Require registered device: {workforcePolicy.clockInDeviceRequired ? "On" : "Off"}
                    </button>
                    <span className="text-zinc-500">
                      {workforcePolicy.clockInAllowedDeviceIds.length
                        ? `${workforcePolicy.clockInAllowedDeviceIds.length} approved device(s)`
                        : "Any active device registered to this venue"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      onClick={() => void configureGeofence()}
                      className="min-h-11 rounded-lg border border-emerald-500/50 px-3 text-emerald-200"
                    >
                      Configure clock-in geofence
                    </button>
                    {workforcePolicy.clockInLocationRequired ? (
                      <button
                        type="button"
                        onClick={() =>
                          void put("/workforce/phase10/policy", {
                            clockInLocationRequired: false,
                          })
                        }
                        className="min-h-11 rounded-lg border border-zinc-700 px-3"
                      >
                        Disable geofence
                      </button>
                    ) : null}
                    <span className="text-zinc-500">
                      {workforcePolicy.clockInLocationRequired
                        ? `${workforcePolicy.clockInLatitude}, ${workforcePolicy.clockInLongitude} · ${workforcePolicy.clockInRadiusMeters} m`
                        : "Location restriction off"}
                    </span>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-zinc-800 p-5">
              <h2 className="text-lg font-semibold">Elevated approval rules</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {policies
                  .filter((row) => row.actionKind !== "SALE")
                  .map((row) => (
                    <button
                      key={row.actionKind}
                      type="button"
                      onClick={() =>
                        void put("/workforce/phase10/approval-policies", {
                          actionKind: row.actionKind,
                          enabled: !row.enabled,
                          amountThresholdMinor: row.amountThresholdMinor,
                          requirePassword: true,
                          notifyOnUse: true,
                        })
                      }
                      className={`min-h-12 rounded-xl border px-3 text-left ${
                        row.enabled
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-zinc-800"
                      }`}
                    >
                      <strong>{row.actionKind}</strong>
                      <span className="ml-2 text-xs text-zinc-400">
                        {row.enabled ? "Approval required" : "Permission only"}
                      </span>
                    </button>
                  ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 p-5">
              <h2 className="text-lg font-semibold">Suspicious-action alerts</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Repeated actions are grouped into dedupe windows to avoid alert fatigue.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {notificationRules
                  .filter((row) => row.actionKind !== "SALE")
                  .map((row) => (
                    <button
                      key={row.actionKind}
                      type="button"
                      onClick={() =>
                        void put("/workforce/phase10/notification-rules", {
                          ...row,
                          enabled: !row.enabled,
                        })
                      }
                      className={`min-h-12 rounded-xl border px-3 text-left ${
                        row.enabled
                          ? "border-amber-500/60 bg-amber-500/10"
                          : "border-zinc-800"
                      }`}
                    >
                      <strong>{row.actionKind}</strong>
                      <span className="ml-2 text-xs text-zinc-400">
                        {row.enabled ? "Alerting" : "Off"}
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "Accountability" ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Approved by</th>
                  <th className="p-3">Auth</th>
                  <th className="p-3">Flag</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="p-3">{new Date(row.occurredAt).toLocaleString()}</td>
                    <td className="p-3">{row.actorName}</td>
                    <td className="p-3">{row.actionKind}</td>
                    <td className="p-3">{row.approverName ?? "—"}</td>
                    <td className="p-3">{row.authStrength}</td>
                    <td className={`p-3 ${row.suspicious ? "text-amber-300" : "text-zinc-500"}`}>
                      {row.suspicious
                        ? (row.suspiciousReasons ?? []).join(", ")
                        : "Normal"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "Performance" ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Sales</th>
                  <th className="p-3">Avg check</th>
                  <th className="p-3">Resource sessions</th>
                  <th className="p-3">Discounts</th>
                  <th className="p-3">Refunds / voids</th>
                  <th className="p-3">Cash variance</th>
                  <th className="p-3">Hours</th>
                  <th className="p-3">Labor / sales</th>
                  <th className="p-3">KDS ready / avg</th>
                  <th className="p-3">Overtime</th>
                  <th className="p-3">Late</th>
                  <th className="p-3">Break exceptions</th>
                  <th className="p-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => (
                  <tr key={row.membershipId} className="border-t border-zinc-800">
                    <td className="p-3">{row.displayName}</td>
                    <td className="p-3">{row.salesCount}</td>
                    <td className="p-3">{formatMinor(row.averageCheckMinor)}</td>
                    <td className="p-3">{row.resourceSessionCount}</td>
                    <td className="p-3">{row.discountCount}</td>
                    <td className="p-3">{row.refundCount} / {row.voidCount}</td>
                    <td className="p-3">
                      {formatCashVariance(row.cashVariance, row.cashVarianceCurrency)}
                      <span className="ml-1 text-xs text-zinc-500">
                        ({row.cashVarianceCloseCount} close{row.cashVarianceCloseCount === 1 ? "" : "s"})
                      </span>
                    </td>
                    <td className="p-3">{row.workedHours.toFixed(1)}</td>
                    <td className="p-3">
                      {row.laborToSalesBasisPoints == null
                        ? "—"
                        : `${(row.laborToSalesBasisPoints / 100).toFixed(2)}%`}
                    </td>
                    <td className="p-3">
                      {row.kdsReadyCount} / {row.kdsAverageReadySeconds == null ? "—" : `${row.kdsAverageReadySeconds}s`}
                    </td>
                    <td className="p-3">{(row.overtimeSeconds / 3600).toFixed(1)} h</td>
                    <td className="p-3">{row.lateCount}</td>
                    <td className="p-3">{row.breakComplianceViolations}</td>
                    <td className="p-3">{row.exceptionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-zinc-800 p-3 text-xs text-zinc-500">
              Operational review aids only. Metrics are not automatic grounds for punitive conclusions and GoSpots does not treat this report as payroll.
            </p>
          </div>
        ) : null}
      </div>
    </TenantPage>
  );
}