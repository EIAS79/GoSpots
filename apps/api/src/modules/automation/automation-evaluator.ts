export type AutomationCondition =
  | { all: AutomationCondition[] }
  | { any: AutomationCondition[] }
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists'; value?: unknown };

function readPath(input: unknown, path: string): unknown {
  let current: unknown = input;
  for (const part of path.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateAutomationCondition(condition: AutomationCondition | null, input: unknown): boolean {
  if (!condition) return true;
  if ('all' in condition) return condition.all.every((item) => evaluateAutomationCondition(item, input));
  if ('any' in condition) return condition.any.some((item) => evaluateAutomationCondition(item, input));
  const actual = readPath(input, condition.field);
  switch (condition.op) {
    case 'exists':
      return condition.value === false ? actual == null : actual != null;
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'gt':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'gte':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lt':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'lte':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    default:
      return false;
  }
}
