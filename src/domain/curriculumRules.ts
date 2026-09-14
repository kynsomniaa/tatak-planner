import { Curriculum, StudentWorkspace } from '../types';

/** FEU Tech CpE relationships that the SOLAR export does not label explicitly. */
export const FEU_CPE_COREQUISITE_PAIRS: Array<[string, string]> = [
  ['COE0001', 'COE0003'],
];

interface ProgramCourseMetadata {
  codes?: string[];
  title?: RegExp;
  courseRole: import('../types').CourseRole;
  foundationalWeight?: number;
  challenging?: boolean;
}

/** Program-owned semantic metadata; layout code remains reusable and coordinate-free. */
const PROGRAM_COURSE_METADATA: Record<string, ProgramCourseMetadata[]> = {
  'BS Computer Engineering': [
    { codes: ['COE0007'], title: /\bCALCULUS 1\b/i, courseRole: 'core_gateway', foundationalWeight: 0.96, challenging: true },
    { codes: ['COE0013'], title: /\bCALCULUS 2\b/i, courseRole: 'foundation', foundationalWeight: 0.92, challenging: true },
    { codes: ['COE0011'], title: /ENGINEERING DATA ANALYSIS/i, courseRole: 'core_gateway', foundationalWeight: 1, challenging: true },
    { codes: ['COE0009'], title: /PHYSICS FOR ENGINEERS 1/i, courseRole: 'core_gateway', foundationalWeight: 0.98, challenging: true },
    { codes: ['COE0015'], title: /PHYSICS FOR ENGINEERS 2/i, courseRole: 'foundation', foundationalWeight: 0.94, challenging: true },
    { title: /PRACTICE AND DESIGN|THESIS|CAPSTONE/i, courseRole: 'milestone' },
    { title: /INTERNSHIP|\bOJT\b|PRACTICUM/i, courseRole: 'milestone' },
  ],
};

function metadataForCourse(curriculum: Curriculum, code: string, title: string) {
  return (PROGRAM_COURSE_METADATA[curriculum.program] ?? []).find((item) =>
    (item.codes?.includes(code) ?? false) || Boolean(item.title?.test(title)),
  );
}

export function applyKnownCurriculumRules(curriculum: Curriculum): Curriculum {
  const available = new Set(curriculum.courses.map((course) => course.code));
  const known = new Map<string, Set<string>>();
  FEU_CPE_COREQUISITE_PAIRS.forEach(([left, right]) => {
    if (!available.has(left) || !available.has(right)) return;
    known.set(left, new Set([...(known.get(left) ?? []), right]));
    known.set(right, new Set([...(known.get(right) ?? []), left]));
  });
  return {
    ...curriculum,
    courses: curriculum.courses.map((course) => {
      const metadata = metadataForCourse(curriculum, course.code, course.title);
      return {
        ...course,
        corequisites: [...new Set([...(course.corequisites ?? []), ...(known.get(course.code) ?? [])])],
        courseRole: metadata?.courseRole ?? course.courseRole ?? 'standard',
        foundationalWeight: metadata?.foundationalWeight ?? course.foundationalWeight,
        challenging: metadata?.challenging ?? course.challenging,
      };
    }),
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
