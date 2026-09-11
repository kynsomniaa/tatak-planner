import { StudentWorkspace } from '../types';

export const CURRENT_PLANNER_MODEL_VERSION = 3;

/** Converts column-board plans into chronological raids while preserving progress, grades, and accounts. */
export function migratePlannerWorkspace(workspace: StudentWorkspace): StudentWorkspace {
  if (!workspace.curriculum || workspace.plannerModelVersion === CURRENT_PLANNER_MODEL_VERSION) return workspace;
  const currentTermId = workspace.academicProfile?.currentTermId ?? workspace.curriculum.terms[0]?.id;
  if (!currentTermId) return { ...workspace, plannerModelVersion: CURRENT_PLANNER_MODEL_VERSION };
  const curriculum = workspace.curriculum;
  const currentTerm = curriculum.terms.find((term) => term.id === currentTermId) ?? curriculum.terms[0];
  const firstTerm = [...curriculum.terms].sort((left, right) => left.order - right.order)[0];
  const included = new Set<string>();
  const raidPlan: Record<string, string> = {};
  curriculum.courses.forEach((course) => {
    const status = workspace.statuses[course.code] ?? 'pending';
    if (course.originalTermId === firstTerm?.id || status === 'passed' || status === 'active') included.add(course.code);
    if (status === 'active') raidPlan[course.code] = currentTermId;
    else if (course.originalTermId === firstTerm?.id || status === 'passed') raidPlan[course.code] = course.originalTermId;
  });
  const raidTermIds = curriculum.terms
    .filter((term) => term.order <= (currentTerm?.order ?? 0))
    .sort((left, right) => left.order - right.order)
    .map((term) => term.id);
  return {
    ...workspace,
    plannerModelVersion: CURRENT_PLANNER_MODEL_VERSION,
    plannedCourseCodes: [...included],
    plannerTermIds: raidTermIds,
    customPlannerTerms: [],
    raidNames: {},
    plan: raidPlan,
    goal: undefined,
    preferences: workspace.preferences ? {
      ...workspace.preferences,
      boardLayouts: undefined,
    } : undefined,
    updatedAt: new Date().toISOString(),
  };
}
