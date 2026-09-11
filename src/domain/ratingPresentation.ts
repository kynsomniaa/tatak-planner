import type { CourseRatingSummary } from '../types';

/** Compact aggregate of the three criteria used only as a quick course preview. */
export function courseRatingPreview(summary: CourseRatingSummary): string | null {
  if (summary.count === 0 || summary.difficulty === null || summary.workload === null || summary.usefulness === null) return null;
  const score = (summary.difficulty + summary.workload + summary.usefulness) / 3;
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}  ${score.toFixed(1)} (${summary.count})`;
}
