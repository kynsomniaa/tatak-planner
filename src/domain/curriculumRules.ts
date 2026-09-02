import { Curriculum, StudentWorkspace } from '../types';

/** FEU Tech CpE relationships that the SOLAR export does not label explicitly. */
export const FEU_CPE_COREQUISITE_PAIRS: Array<[string, string]> = [
  ['COE0001', 'COE0003'],
];

export function applyKnownCurriculumRules(curriculum: Curriculum): Curriculum {
  const available = new Set(curriculum.courses.map((course) => course.code));
  const known = new Map<string, Set<string>>();
  FEU_CPE_COREQUISITE_PAIRS.forEach(([left, right]) => {
    if (!available.has(left) || !available.has(right)) return;
    known.set(left, new Set([...(known.get(left) ?? []), right]));
    known.set(right, new Set([...(known.get(right) ?? []), left]));
  });
  if (known.size === 0) return curriculum;
  return {
    ...curriculum,
    courses: curriculum.courses.map((course) => ({
      ...course,
      corequisites: [...new Set([...(course.corequisites ?? []), ...(known.get(course.code) ?? [])])],
    })),
  };
}

export function normalizeWorkspaceRules(workspace: StudentWorkspace): StudentWorkspace {
  if (!workspace.curriculum) return workspace;
  return { ...workspace, curriculum: applyKnownCurriculumRules(workspace.curriculum) };
}

export const isInternshipCourse = (title: string) => /INTERNSHIP|PRACTICUM|\bOJT\b/i.test(title);

const GENERIC_THESIS_PATTERN = /THESIS|CAPSTONE|DESIGN PROJECT|RESEARCH PROJECT|FINAL PROJECT/i;
const PROGRAM_THESIS_PATTERNS: Record<string, RegExp[]> = {
  'BS Computer Engineering': [/\bCPE PRACTICE AND DESIGN\b/i, /\bPRACTICE AND DESIGN\b/i],
};

/** Recognizes each program's official thesis naming while retaining generic titles for future imports. */
export const isThesisOrDesignCourse = (title: string, program?: string) =>
  GENERIC_THESIS_PATTERN.test(title)
  || (program ? (PROGRAM_THESIS_PATTERNS[program] ?? []).some((pattern) => pattern.test(title)) : false);
