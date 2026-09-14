import { AcademicProfile, Curriculum, CurriculumTerm } from '../types';

export interface AcademicCalendarPosition {
  academicYear: number;
  term: number;
}

/** FEU Tech trimester approximation used only for chronological Raid context. */
export function academicCalendarPosition(date = new Date()): AcademicCalendarPosition {
  const month = date.getMonth();
  if (month >= 5 && month <= 9) return { academicYear: date.getFullYear(), term: 1 };
  if (month >= 10) return { academicYear: date.getFullYear(), term: 2 };
  if (month <= 1) return { academicYear: date.getFullYear() - 1, term: 2 };
  return { academicYear: date.getFullYear() - 1, term: 3 };
}

export function currentCurriculumTerm(
  curriculum: Curriculum,
  firstEnrollmentYear: number,
  firstEnrollmentTerm = 1,
  date = new Date(),
): CurriculumTerm {
  const current = academicCalendarPosition(date);
  const elapsed = (current.academicYear - firstEnrollmentYear) * 3 + (current.term - firstEnrollmentTerm);
  const ordered = [...curriculum.terms].sort((left, right) => left.order - right.order);
  const index = Math.max(0, Math.min(ordered.length - 1, elapsed));
  return ordered[index] ?? curriculum.terms[0];
}

export function currentRaidTerm(curriculum: Curriculum, profile?: AcademicProfile, date = new Date()) {
  if (!profile) return curriculum.terms[0];
  return currentCurriculumTerm(curriculum, profile.startYear, profile.startTerm ?? 1, date);
}

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
