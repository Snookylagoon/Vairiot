import {
  CONDITION_FROM_GRADE, conditionColumns, DEFAULT_CONDITION_SCALE, GRADE_FROM_CONDITION, isConditionGrade,
} from '../constants/condition.constants';

describe('condition grades (S1.5)', () => {
  it('maps every grade to a string and back', () => {
    for (const g of [1, 2, 3, 4, 5] as const) expect(GRADE_FROM_CONDITION[CONDITION_FROM_GRADE[g]]).toBe(g);
  });

  it('defaults to five grades with photos and impairment at 2 and below', () => {
    expect(DEFAULT_CONDITION_SCALE.map(e => e.grade)).toEqual([5, 4, 3, 2, 1]);
    expect(DEFAULT_CONDITION_SCALE.filter(e => e.photoRequired).map(e => e.grade)).toEqual([2, 1]);
    expect(DEFAULT_CONDITION_SCALE.filter(e => e.impairmentIndicator).map(e => e.grade)).toEqual([2, 1]);
  });

  it('derives the other column from whichever was sent; the grade wins', () => {
    expect(conditionColumns({ conditionGrade: 2 })).toEqual({ condition: 'poor', conditionGrade: 2 });
    expect(conditionColumns({ condition: 'Fair' })).toEqual({ condition: 'Fair', conditionGrade: 3 });
    expect(conditionColumns({ condition: 'good', conditionGrade: 1 })).toEqual({ condition: 'damaged', conditionGrade: 1 });
    expect(conditionColumns({ condition: 'shiny' })).toEqual({ condition: 'shiny', conditionGrade: null });
    expect(conditionColumns({})).toBeUndefined();
    expect(conditionColumns({ conditionGrade: 7 })).toBeUndefined();
    expect(isConditionGrade(3.5)).toBe(false);
  });
});
