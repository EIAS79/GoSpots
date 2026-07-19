import type { MealPeriod } from '@prisma/client';

export type MealPeriodPreset = {
  value: MealPeriod;
  label: string;
  from: string;
  to: string;
};

export const MEAL_PERIOD_PRESETS: MealPeriodPreset[] = [
  { value: 'ALL_DAY', label: 'All day', from: '00:00', to: '23:59' },
  { value: 'BREAKFAST', label: 'Breakfast', from: '07:00', to: '11:00' },
  { value: 'BRUNCH', label: 'Brunch', from: '10:00', to: '14:00' },
  { value: 'LUNCH', label: 'Lunch', from: '12:00', to: '15:00' },
  { value: 'AFTERNOON', label: 'Afternoon', from: '14:00', to: '17:00' },
  { value: 'DINNER', label: 'Dinner', from: '17:00', to: '22:00' },
  { value: 'LATE_NIGHT', label: 'Late night', from: '22:00', to: '02:00' },
];

export function mealPeriodLabel(period: MealPeriod | null | undefined) {
  if (!period) return null;
  return MEAL_PERIOD_PRESETS.find((p) => p.value === period)?.label ?? period;
}

export function presetForPeriod(period: MealPeriod | null | undefined) {
  if (!period) return null;
  return MEAL_PERIOD_PRESETS.find((p) => p.value === period) ?? null;
}
