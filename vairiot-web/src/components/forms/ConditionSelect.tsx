import type { UseFormRegisterReturn } from 'react-hook-form';
import { CONDITION_FROM_GRADE, DEFAULT_CONDITION_SCALE, GRADE_FROM_CONDITION } from 'vairiot-shared';

import { useConditionScale } from '@/hooks/useCondition';

/**
 * The asset's condition on the tenant's graded scale (stage 1.14). Values
 * are the condition strings; the API sets the grade from them.
 */
export function ConditionSelect({ registration, categoryId, value }: {
  registration: UseFormRegisterReturn;
  categoryId?: string | null;
  value?: string;
}) {
  const { data } = useConditionScale(categoryId || null);
  const entries = data?.entries ?? DEFAULT_CONDITION_SCALE;
  const grade = value ? GRADE_FROM_CONDITION[value.toLowerCase()] : undefined;
  const selected = entries.find(e => e.grade === grade);
  return (
    <div>
      <label className="block text-sm font-medium text-v-charcoal mb-1">Condition</label>
      <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-v-pink bg-white"
        {...registration}>
        {entries.map(e => <option key={e.grade} value={CONDITION_FROM_GRADE[e.grade]}>{e.grade} · {e.label}</option>)}
      </select>
      {selected && <p className="text-xs text-gray-500 mt-1">{selected.criteria}</p>}
    </div>
  );
}

/** A stored string from before the scale (e.g. "excellent") as the option it now matches. */
export function normaliseCondition(condition: string | null | undefined): string {
  const grade = condition ? GRADE_FROM_CONDITION[condition.toLowerCase()] : undefined;
  return grade ? CONDITION_FROM_GRADE[grade] : 'good';
}
