import { Course, Curriculum, StudentWorkspace } from '../types';
import { createWorkspaceFromCurriculum } from '../parser/feuCurriculumParser';

export function laboratoryParentIndex(curriculum: Curriculum): Map<string, string> {
  const parents = new Map<string, string>();
  curriculum.courses.forEach((course) =>
    course.linkedLaboratories.forEach((labCode) => parents.set(labCode, course.code)),
  );
  return parents;
}

export function visibleCurriculumCourses(curriculum: Curriculum): Course[] {
  const parents = laboratoryParentIndex(curriculum);
  return curriculum.courses.filter((course) => !parents.has(course.code));
}

export function courseBundleCodes(curriculum: Curriculum, code: string): string[] {
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const rootCode = laboratoryParentIndex(curriculum).get(code) ?? code;
  const root = byCode.get(rootCode);
  return root ? [root.code, ...root.linkedLaboratories] : [code];
}

function initialRaidPlan(
  curriculum: Curriculum,
  statuses: Record<string, import('../types').CourseStatus>,
  currentTermId: string,
) {
  const currentTerm = curriculum.terms.find((term) => term.id === currentTermId) ?? curriculum.terms[0];
  const firstTerm = [...curriculum.terms].sort((left, right) => left.order - right.order)[0];
  const included = new Set<string>();
  const plan: Record<string, string> = {};
  curriculum.courses.forEach((course) => {
    const status = statuses[course.code] ?? 'pending';
    if (course.originalTermId === firstTerm?.id || status === 'passed' || status === 'active') included.add(course.code);
    if (status === 'active') plan[course.code] = currentTermId;
    else if (course.originalTermId === firstTerm?.id || status === 'passed') plan[course.code] = course.originalTermId;
  });
  const plannerTermIds = curriculum.terms
    .filter((term) => term.order <= (currentTerm?.order ?? 0))
    .sort((left, right) => left.order - right.order)
    .map((term) => term.id);
  return { plannedCourseCodes: [...included], plannerTermIds, plan };
}

export function inferPrerequisiteCodes(
  curriculum: Curriculum,
  currentCourseCodes: string[],
): string[] {
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const currentBundleCodes = new Set(
    currentCourseCodes.flatMap((code) => courseBundleCodes(curriculum, code)),
  );
  const pending = currentCourseCodes.flatMap((code) =>
    courseBundleCodes(curriculum, code).flatMap(
      (bundleCode) => byCode.get(bundleCode)?.prerequisites ?? [],
    ),
  );
  const inferred = new Set<string>();

  while (pending.length > 0) {
    const prerequisiteCode = pending.pop() as string;
    for (const code of courseBundleCodes(curriculum, prerequisiteCode)) {
      if (currentBundleCodes.has(code) || inferred.has(code)) continue;
      inferred.add(code);
      pending.push(...(byCode.get(code)?.prerequisites ?? []));
    }
  }
  return [...inferred];
}

export function createWorkspaceWithAcademicSetup(
  curriculum: Curriculum,
  currentTermId: string,
  currentCourseCodes: string[],
  manualPassedCodes: string[],
  startYear = new Date().getFullYear(),
  startTerm = 1,
): StudentWorkspace {
  const term = curriculum.terms.find((candidate) => candidate.id === currentTermId);
  if (!term) throw new Error('Choose a valid current school year and term.');

  const workspace = createWorkspaceFromCurriculum(curriculum);
  const currentBundles = new Set(
    currentCourseCodes.flatMap((code) => courseBundleCodes(curriculum, code)),
  );
  const manualBundles = new Set(
    manualPassedCodes.flatMap((code) => courseBundleCodes(curriculum, code)),
  );
  const inferred = inferPrerequisiteCodes(curriculum, currentCourseCodes);
  const statuses = { ...workspace.statuses };

  inferred.forEach((code) => { statuses[code] = 'passed'; });
  manualBundles.forEach((code) => { statuses[code] = 'passed'; });
  currentBundles.forEach((code) => { statuses[code] = 'active'; });
  const raids = initialRaidPlan(curriculum, statuses, term.id);

  return {
    ...workspace,
    statuses,
    plannerModelVersion: 3,
    plannedCourseCodes: raids.plannedCourseCodes,
    plannerTermIds: raids.plannerTermIds,
    plan: raids.plan,
    raidNames: {},
    academicProfile: {
      startYear,
      startTerm,
      currentYear: term.year,
      currentTerm: term.term,
      currentTermId: term.id,
      currentCourseCodes: [...currentCourseCodes],
      inferredPassedCodes: inferred,
      manualPassedCodes: [...manualBundles],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createWorkspaceFromProgress(
  curriculum: Curriculum,
  currentTermId: string,
  selectedStatuses: Record<string, import('../types').CourseStatus>,
  prerequisiteOverrides: Record<string, string[]>,
  startYear = new Date().getFullYear(),
  startTerm = 1,
): StudentWorkspace {
  const currentTerm = curriculum.terms.find((term) => term.id === currentTermId);
  if (!currentTerm) throw new Error('Choose a valid current term.');
  const workspace = createWorkspaceFromCurriculum(curriculum);
  const statuses = { ...workspace.statuses };

  for (const course of curriculum.courses) {
    statuses[course.code] = selectedStatuses[course.code] ?? 'pending';
  }

  const raids = initialRaidPlan(curriculum, statuses, currentTermId);

  return {
    ...workspace,
    plannerModelVersion: 3,
    statuses,
    plan: raids.plan,
    plannedCourseCodes: raids.plannedCourseCodes,
    plannerTermIds: raids.plannerTermIds,
    raidNames: {},
    retakeAttempts: [],
    academicProfile: {
      startYear,
      startTerm,
      currentYear: currentTerm.year,
      currentTerm: currentTerm.term,
      currentTermId,
      currentCourseCodes: curriculum.courses
        .filter((course) => statuses[course.code] === 'active')
        .map((course) => course.code),
      inferredPassedCodes: [],
      manualPassedCodes: curriculum.courses
        .filter((course) => statuses[course.code] === 'passed')
        .map((course) => course.code),
      prerequisiteOverrides,
    },
    updatedAt: new Date().toISOString(),
  };
}
