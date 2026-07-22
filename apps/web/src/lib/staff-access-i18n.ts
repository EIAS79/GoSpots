import type { DashboardAccessGroup, AccessToggle } from "@/lib/dashboard-access";
import type { MessageKey } from "@/lib/i18n";

export type StaffAccessTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

function resolve(
  t: StaffAccessTranslate,
  key: MessageKey,
  fallback: string,
): string {
  const value = t(key);
  return !value || value === key ? fallback : value;
}

/** Localize a permission group’s chrome using `team.accessGroup.*` / `team.accessPerm.*`. */
export function localizeAccessGroup(
  t: StaffAccessTranslate,
  group: DashboardAccessGroup,
): DashboardAccessGroup {
  return {
    ...group,
    label: resolve(t, `team.accessGroup.${group.id}.label`, group.label),
    description: resolve(
      t,
      `team.accessGroup.${group.id}.description`,
      group.description,
    ),
    toggles: group.toggles.map((tog) => localizeAccessToggle(t, tog)),
  };
}

function localizeAccessToggle(
  t: StaffAccessTranslate,
  toggle: AccessToggle,
): AccessToggle {
  const [ns, action] = toggle.perm.split(".");
  const labelKey = `team.accessPerm.${ns}.${action}` as MessageKey;
  const hintKey = `team.accessPerm.${ns}.${action}Hint` as MessageKey;
  return {
    ...toggle,
    label: resolve(t, labelKey, toggle.label),
    hint: toggle.hint
      ? resolve(t, hintKey, toggle.hint)
      : undefined,
  };
}
