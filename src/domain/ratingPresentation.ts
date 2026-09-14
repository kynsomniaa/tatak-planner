import type { CourseRatingSummary } from '../types';

export interface CourseRatingPreview {
  average: number;
  count: number;
}

/** Fractional fill for each reusable visual star. */
export function starFillFractions(value: number, max = 5): number[] {
  const normalized = Math.max(0, Math.min(max, value));
  return Array.from({ length: max }, (_, index) => Math.max(0, Math.min(1, normalized - index)));
}

/** Compact aggregate of the three criteria used only as a quick course preview. */
export function courseRatingPreview(summary: CourseRatingSummary): CourseRatingPreview | null {
  if (summary.count === 0 || summary.difficulty === null || summary.workload === null || summary.usefulness === null) return null;
  return {
    average: (summary.difficulty + summary.workload + summary.usefulness) / 3,
    count: summary.count,
  };
}
