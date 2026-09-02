import { AcademicProfile, CurriculumTerm } from '../types';

export function academicTermLabel(term: CurriculumTerm, profile?: AcademicProfile, fallbackDate?: string): string {
  const fallback = fallbackDate ? new Date(fallbackDate) : new Date();
  const fallbackYear = fallback.getMonth() >= 5 ? fallback.getFullYear() : fallback.getFullYear() - 1;
  const startYear = profile?.startYear ?? fallbackYear;
  const startTerm = profile?.startTerm ?? 1;
  const sequence = (term.year - 1) * 3 + (term.term - 1);
  const calendarIndex = startTerm - 1 + sequence;
  const schoolYear = startYear + Math.floor(calendarIndex / 3);
  const trimester = calendarIndex % 3 + 1;
  return `SY ${schoolYear}–${schoolYear + 1} · Term ${trimester}`;
}

