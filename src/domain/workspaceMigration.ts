import { StudentWorkspace } from '../types';
import { courseBundleCodes, visibleCurriculumCourses } from './academicSetup';

export const CURRENT_PLANNER_MODEL_VERSION = 2;

/** Clears prototype planning tests once while preserving curriculum, progress, grades, and account data. */
export function migratePlannerWorkspace(workspace: StudentWorkspace): StudentWorkspace {
  if (!workspace.curriculum || workspace.plannerModelVersion === CURRENT_PLANNER_MODEL_VERSION) return workspace;
  const currentTermId = workspace.academicProfile?.currentTermId ?? workspace.curriculum.terms[0]?.id;
  if (!currentTermId) return { ...workspace, plannerModelVersion: CURRENT_PLANNER_MODEL_VERSION };
  const activeRoots = visibleCurriculumCourses(workspace.curriculum)
    .filter((course) => courseBundleCodes(workspace.curriculum as NonNullable<StudentWorkspace['curriculum']>, course.code)
      .some((code) => workspace.statuses[code] === 'active'));
  const activeCodes = [...new Set(activeRoots.flatMap((course) => courseBundleCodes(workspace.curriculum as NonNullable<StudentWorkspace['curriculum']>, course.code)))];
  return {
    ...workspace,
    plannerModelVersion: CURRENT_PLANNER_MODEL_VERSION,
    plannedCourseCodes: activeCodes,
    plannerTermIds: [currentTermId],
    customPlannerTerms: [],
    retakeAttempts: [],
    plan: { ...workspace.plan, ...Object.fromEntries(activeCodes.map((code) => [code, currentTermId])) },
    goal: undefined,
    preferences: workspace.preferences ? {
      ...workspace.preferences,
      boardLayouts: workspace.preferences.boardLayouts
        ? { ...workspace.preferences.boardLayouts, planner: undefined }
        : undefined,
    } : undefined,
    updatedAt: new Date().toISOString(),
  };
}
