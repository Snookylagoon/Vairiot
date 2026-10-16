// Graded condition scale (Phase 1 W5, S1.5). Grade 5 is best. The older
// condition strings stay in use beside the grade, one for one, so filters,
// reports and app builds that know only the strings keep working.

export type ConditionGrade = 1 | 2 | 3 | 4 | 5;

export const CONDITION_GRADES: readonly ConditionGrade[] = [5, 4, 3, 2, 1];

export const CONDITION_FROM_GRADE: Record<ConditionGrade, string> = {
  5: 'new', 4: 'good', 3: 'fair', 2: 'poor', 1: 'damaged',
};

export const GRADE_FROM_CONDITION: Record<string, ConditionGrade> = {
  new: 5, excellent: 5, good: 4, fair: 3, poor: 2, damaged: 1, unserviceable: 1,
};

export interface ConditionScaleEntry {
  grade: ConditionGrade;
  label: string;
  criteria: string;
  colour: string;
  /** An IPSAS 21/26 impairment indicator (used by S2). */
  impairmentIndicator: boolean;
  /** A scan at this grade needs a photo. */
  photoRequired: boolean;
}

/** Used until a tenant (or category) sets its own scale. */
export const DEFAULT_CONDITION_SCALE: readonly ConditionScaleEntry[] = [
  { grade: 5, label: 'Excellent', criteria: 'As new. No visible wear or defects; fully functional.', colour: '#16a34a', impairmentIndicator: false, photoRequired: false },
  { grade: 4, label: 'Good', criteria: 'Minor wear only. Fully functional; routine maintenance.', colour: '#65a30d', impairmentIndicator: false, photoRequired: false },
  { grade: 3, label: 'Fair', criteria: 'Visible wear or minor damage. Functional; repair needed soon.', colour: '#d97706', impairmentIndicator: false, photoRequired: false },
  { grade: 2, label: 'Poor', criteria: 'Significant damage or deterioration. Partly functional; major repair needed.', colour: '#ea580c', impairmentIndicator: true, photoRequired: true },
  { grade: 1, label: 'Unserviceable', criteria: 'Not functional or unsafe. Replace or dispose.', colour: '#dc2626', impairmentIndicator: true, photoRequired: true },
];

export function isConditionGrade(v: unknown): v is ConditionGrade {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * The string and grade columns for a write that sent either or both. The
 * grade wins when both are sent; an unknown string keeps its value with no
 * grade. Undefined when neither was sent (leave the asset as it is).
 */
export function conditionColumns(input: { condition?: string | null; conditionGrade?: number | null }):
  { condition: string; conditionGrade: ConditionGrade | null } | undefined {
  if (input.conditionGrade != null) {
    if (!isConditionGrade(input.conditionGrade)) return undefined;
    return { condition: CONDITION_FROM_GRADE[input.conditionGrade], conditionGrade: input.conditionGrade };
  }
  if (input.condition) {
    return { condition: input.condition, conditionGrade: GRADE_FROM_CONDITION[input.condition.toLowerCase()] ?? null };
  }
  return undefined;
}
