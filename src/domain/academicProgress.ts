import { CourseStatus, CourseVisualState, Curriculum, StudentWorkspace } from '../types';
import { courseBundleCodes, laboratoryParentIndex } from './academicSetup';
import { currentRaidTerm } from './academicCalendar';

export interface ProgressValidationError {
  courseCode: string;
  requestedStatus: CourseStatus;
  missingPrerequisites: string[];
  blockedDependents?: string[];
  message: string;
}

export interface ProgressStatusResult<T> {
  ok: boolean;
  value: T;
  changedCodes: string[];
  error?: ProgressValidationError;
}

const courseIndex = (curriculum: Curriculum) => new Map(curriculum.courses.map((course) => [course.code, course]));

function transitionBundle(curriculum: Curriculum, courseCode: string, status: CourseStatus): string[] {
  const courses = courseIndex(curriculum);
  const result = new Set<string>();
  const pending = [courseCode];
  while (pending.length > 0) {
    const code = pending.pop() as string;
    courseBundleCodes(curriculum, code).forEach((bundleCode) => {
      if (result.has(bundleCode)) return;
      result.add(bundleCode);
      if (status === 'active') {
        courses.get(bundleCode)?.corequisites.forEach((corequisite) => {
          if (!result.has(corequisite)) pending.push(corequisite);
        });
      }
    });
  }
  return [...result];
}

export function getMissingPrerequisites(
  curriculum: Curriculum,
  statuses: Record<string, CourseStatus>,
  courseCode: string,
  requestedStatus: CourseStatus,
): string[] {
  if (requestedStatus !== 'active' && requestedStatus !== 'passed') return [];
  const courses = courseIndex(curriculum);
  const laboratoryParents = laboratoryParentIndex(curriculum);
  const bundle = new Set(transitionBundle(curriculum, courseCode, requestedStatus));
  const missing = new Set<string>();
  bundle.forEach((code) => courses.get(code)?.prerequisites.forEach((prerequisite) => {
    if (bundle.has(prerequisite)) return;
    const visiblePrerequisite = laboratoryParents.get(prerequisite) ?? prerequisite;
    const prerequisiteBundle = courseBundleCodes(curriculum, visiblePrerequisite);
    if (!prerequisiteBundle.every((linked) => statuses[linked] === 'passed')) missing.add(visiblePrerequisite);
  }));
  return [...missing].sort();
}

function namedCodes(curriculum: Curriculum, codes: string[]) {
  const courses = courseIndex(curriculum);
  return codes.map((code) => `${code} — ${courses.get(code)?.title ?? 'Course not found'}`);
}

function missingError(curriculum: Curriculum, courseCode: string, requestedStatus: CourseStatus, missing: string[]): ProgressValidationError {
  const target = courseIndex(curriculum).get(courseCode);
  const state = requestedStatus === 'active' ? 'Active' : 'Passed';
  return {
    courseCode,
    requestedStatus,
    missingPrerequisites: missing,
    message: `Cannot mark ${courseCode}${target ? ` — ${target.title}` : ''} as ${state}.\nComplete ${missing.length === 1 ? 'this prerequisite' : 'these prerequisites'} first:\n${namedCodes(curriculum, missing).map((item) => `• ${item}`).join('\n')}`,
  };
}

export function validateProgressStatusChange(
  curriculum: Curriculum,
  statuses: Record<string, CourseStatus>,
  courseCode: string,
  requestedStatus: CourseStatus,
): ProgressValidationError | null {
  const missing = getMissingPrerequisites(curriculum, statuses, courseCode, requestedStatus);
  return missing.length > 0 ? missingError(curriculum, courseCode, requestedStatus, missing) : null;
}

function statusesRemainValid(curriculum: Curriculum, statuses: Record<string, CourseStatus>) {
  for (const course of curriculum.courses) {
    const status = statuses[course.code] ?? 'pending';
    if (status !== 'active' && status !== 'passed') continue;
    const missing = getMissingPrerequisites(curriculum, statuses, course.code, status);
    if (missing.length > 0) return { courseCode: course.code, missing };
  }
  return null;
}

export function applyProgressStatusChange(
  curriculum: Curriculum,
  statuses: Record<string, CourseStatus>,
  courseCode: string,
  requestedStatus: CourseStatus,
): ProgressStatusResult<Record<string, CourseStatus>> {
  const error = validateProgressStatusChange(curriculum, statuses, courseCode, requestedStatus);
  if (error) return { ok: false, value: statuses, changedCodes: [], error };
  const changedCodes = transitionBundle(curriculum, courseCode, requestedStatus);
  const next = {
    ...statuses,
    ...Object.fromEntries(changedCodes.map((code) => [code, requestedStatus])),
  };
  if (requestedStatus !== 'active' && requestedStatus !== 'passed') {
    const invalid = statusesRemainValid(curriculum, next);
    if (invalid) {
      const dependentNames = namedCodes(curriculum, [invalid.courseCode]);
      return {
        ok: false,
        value: statuses,
        changedCodes: [],
        error: {
          courseCode,
          requestedStatus,
          missingPrerequisites: [],
          blockedDependents: [invalid.courseCode],
          message: `Cannot change ${courseCode} yet. It is still required by:\n${dependentNames.map((item) => `• ${item}`).join('\n')}`,
        },
      };
    }
  }
  return { ok: true, value: next, changedCodes };
}

/** Atomically processes a term/year selection in dependency order. */
export function applyBulkPassedChange(
  curriculum: Curriculum,
  statuses: Record<string, CourseStatus>,
  courseCodes: string[],
): ProgressStatusResult<Record<string, CourseStatus>> {
  let next = { ...statuses };
  const pending = [...new Set(courseCodes)];
  const changed = new Set<string>();
  while (pending.length > 0) {
    let madeProgress = false;
    for (let index = 0; index < pending.length;) {
      const code = pending[index];
      if (next[code] === 'passed') {
        pending.splice(index, 1);
        madeProgress = true;
        continue;
      }
      const result = applyProgressStatusChange(curriculum, next, code, 'passed');
      if (!result.ok) {
        index += 1;
        continue;
      }
      next = result.value;
      result.changedCodes.forEach((changedCode) => changed.add(changedCode));
      pending.splice(index, 1);
      madeProgress = true;
    }
    if (!madeProgress) {
      const blocked = pending[0];
      const missing = getMissingPrerequisites(curriculum, next, blocked, 'passed');
      return {
        ok: false,
        value: statuses,
        changedCodes: [],
        error: missingError(curriculum, blocked, 'passed', missing),
      };
    }
  }
  return { ok: true, value: next, changedCodes: [...changed] };
}

export function applyWorkspaceProgressStatus(
  workspace: StudentWorkspace,
  courseCode: string,
  requestedStatus: CourseStatus,
): ProgressStatusResult<StudentWorkspace> {
  const curriculum = workspace.curriculum;
  if (!curriculum) return { ok: false, value: workspace, changedCodes: [] };
  const result = applyProgressStatusChange(curriculum, workspace.statuses, courseCode, requestedStatus);
  if (!result.ok) return { ...result, value: workspace };
  const planned = new Set(workspace.plannedCourseCodes ?? []);
  const plan = { ...workspace.plan };
  const currentTerm = currentRaidTerm(curriculum, workspace.academicProfile);
  const currentTermId = currentTerm?.id ?? curriculum.terms[0]?.id;
  result.changedCodes.forEach((code) => {
    const course = curriculum.courses.find((candidate) => candidate.code === code);
    if (requestedStatus === 'active') {
      planned.add(code);
      if (currentTermId) plan[code] = currentTermId;
    } else if (requestedStatus === 'passed') {
      planned.add(code);
      if (!plan[code] && course) plan[code] = course.originalTermId;
    } else {
      planned.delete(code);
      delete plan[code];
    }
  });
  const statuses = result.value;
  const academicProfile = workspace.academicProfile ? {
    ...workspace.academicProfile,
    currentYear: currentTerm.year,
    currentTerm: currentTerm.term,
    currentTermId: currentTerm.id,
    currentCourseCodes: curriculum.courses.filter((course) => statuses[course.code] === 'active').map((course) => course.code),
    manualPassedCodes: curriculum.courses.filter((course) => statuses[course.code] === 'passed').map((course) => course.code),
  } : undefined;
  const plannerTermIds = new Set(workspace.plannerTermIds ?? []);
  if (requestedStatus === 'active' && currentTermId) plannerTermIds.add(currentTermId);
  return {
    ok: true,
    changedCodes: result.changedCodes,
    value: {
      ...workspace,
      statuses,
      plan,
      plannedCourseCodes: [...planned],
      plannerTermIds: [...plannerTermIds].sort((left, right) => {
        const leftOrder = curriculum.terms.find((term) => term.id === left)?.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = curriculum.terms.find((term) => term.id === right)?.order ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      }),
      academicProfile,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function courseVisualState(workspace: StudentWorkspace, courseCode: string): CourseVisualState {
  const status = workspace.statuses[courseCode] ?? 'pending';
  if (status === 'passed') return 'passed';
  if (status === 'active') return 'active';
  if ((workspace.plannedCourseCodes ?? []).includes(courseCode)) return 'planned';
  const curriculum = workspace.curriculum;
  if (!curriculum) return 'locked';
  return getMissingPrerequisites(curriculum, workspace.statuses, courseCode, 'active').length === 0 ? 'available' : 'locked';
}

export function eligibleCourseCodes(curriculum: Curriculum, statuses: Record<string, CourseStatus>): string[] {
  return curriculum.courses
    .filter((course) => statuses[course.code] !== 'passed' && statuses[course.code] !== 'active')
    .filter((course) => getMissingPrerequisites(curriculum, statuses, course.code, 'active').length === 0)
    .map((course) => course.code);
}
