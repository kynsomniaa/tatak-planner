import {
  Course,
  CourseStatus,
  Curriculum,
  CurriculumTerm,
  GoalKind,
  MoveCommand,
  PlanViolation,
  PlanWarning,
  StudentWorkspace,
} from '../types';
import { courseBundleCodes, visibleCurriculumCourses } from './academicSetup';

export const RECOMMENDED_MIN_UNITS = 12;
export const RECOMMENDED_MAX_UNITS = 22;

const courseIndex = (curriculum: Curriculum): Map<string, Course> =>
  new Map(curriculum.courses.map((course) => [course.code, course]));

export const plannerTerms = (workspace: StudentWorkspace): CurriculumTerm[] => {
  const official = workspace.curriculum?.terms ?? [];
  const officialIds = new Set(official.map((term) => term.id));
  return [...official, ...(workspace.customPlannerTerms ?? []).filter((term) => !officialIds.has(term.id))]
    .sort((left, right) => left.order - right.order);
};

const termOrder = (workspace: StudentWorkspace): Map<string, number> =>
  new Map(plannerTerms(workspace).map((term) => [term.id, term.order]));

const plannedCodes = (workspace: StudentWorkspace): Set<string> => {
  const included = new Set(
    workspace.plannedCourseCodes ?? workspace.curriculum?.courses.map((course) => course.code) ?? [],
  );
  workspace.curriculum?.courses.forEach((course) => {
    if (included.has(course.code)) course.linkedLaboratories.forEach((code) => included.add(code));
  });
  return included;
};

export function termUnits(workspace: StudentWorkspace, termId: string): number {
  if (!workspace.curriculum) return 0;
  const included = plannedCodes(workspace);
  const regularUnits = workspace.curriculum.courses.reduce((total, course) => {
    if (!included.has(course.code)) return total;
    if (workspace.plan[course.code] !== termId) return total;
    return total + course.units;
  }, 0);
  const courses = courseIndex(workspace.curriculum);
  const retakeUnits = (workspace.retakeAttempts ?? []).reduce((total, attempt) => {
    if (attempt.termId !== termId) return total;
    const course = courses.get(attempt.courseCode);
    if (!course) return total;
    return total + course.units + course.linkedLaboratories.reduce(
      (sum, code) => sum + (courses.get(code)?.units ?? 0),
      0,
    );
  }, 0);
  return regularUnits + retakeUnits;
}

export function termGwa(workspace: StudentWorkspace, termId: string): number | null {
  if (!workspace.curriculum) return null;
  const included = plannedCodes(workspace);
  let weightedTotal = 0;
  let gradedUnits = 0;
  for (const course of workspace.curriculum.courses) {
    if (!included.has(course.code)) continue;
    if (workspace.plan[course.code] !== termId || course.units <= 0) continue;
    const grade = workspace.grades?.[course.code];
    if (grade === undefined || !Number.isFinite(grade)) continue;
    weightedTotal += grade * course.units;
    gradedUnits += course.units;
  }
  for (const attempt of workspace.retakeAttempts ?? []) {
    if (attempt.termId !== termId) continue;
    for (const [code, grade] of Object.entries(attempt.grades)) {
      const course = workspace.curriculum.courses.find((candidate) => candidate.code === code);
      if (!course || course.units <= 0 || !Number.isFinite(grade)) continue;
      weightedTotal += grade * course.units;
      gradedUnits += course.units;
    }
  }
  return gradedUnits > 0 ? weightedTotal / gradedUnits : null;
}

export function updateCourseGrade(
  workspace: StudentWorkspace,
  courseCode: string,
  grade?: number,
): StudentWorkspace {
  const grades = { ...(workspace.grades ?? {}) };
  if (grade === undefined) delete grades[courseCode];
  else grades[courseCode] = grade;
  return { ...workspace, grades, updatedAt: new Date().toISOString() };
}

export function validatePlan(workspace: StudentWorkspace): PlanViolation[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const courses = courseIndex(curriculum);
  const orders = termOrder(workspace);
  const included = plannedCodes(workspace);
  const violations: PlanViolation[] = [];

  for (const course of curriculum.courses) {
    if (!included.has(course.code)) continue;
    const status = workspace.statuses[course.code] ?? 'pending';
    if (status === 'passed') continue;
    const courseTerm = workspace.plan[course.code];
    const courseOrder = orders.get(courseTerm);
    if (courseOrder === undefined) continue;

    for (const prerequisiteCode of course.prerequisites) {
      const prerequisite = courses.get(prerequisiteCode);
      if (!prerequisite) {
        violations.push({
          type: 'unknown-prerequisite',
          courseCode: course.code,
          relatedCode: prerequisiteCode,
          message: `${course.code} references ${prerequisiteCode}, which is missing from the uploaded curriculum.`,
          blocking: false,
        });
        continue;
      }
      if (workspace.statuses[prerequisiteCode] === 'passed') continue;
      const prerequisiteOrder = orders.get(workspace.plan[prerequisiteCode]);
      if (prerequisiteOrder === undefined || prerequisiteOrder >= courseOrder) {
        violations.push({
          type: 'prerequisite',
          courseCode: course.code,
          relatedCode: prerequisiteCode,
          message: `${prerequisiteCode} must be passed or scheduled before ${course.code}.`,
          blocking: true,
        });
      }
    }

    for (const corequisiteCode of course.corequisites) {
      if (!courses.has(corequisiteCode) || workspace.statuses[corequisiteCode] === 'passed') continue;
      if (!included.has(corequisiteCode)) {
        violations.push({
          type: 'corequisite',
          courseCode: course.code,
          relatedCode: corequisiteCode,
          message: `${corequisiteCode} must also be included with ${course.code}.`,
          blocking: true,
        });
        continue;
      }
      if (workspace.plan[corequisiteCode] !== courseTerm) {
        violations.push({
          type: 'corequisite',
          courseCode: course.code,
          relatedCode: corequisiteCode,
          message: `${course.code} and ${corequisiteCode} must stay in the same trimester.`,
          blocking: true,
        });
      }
    }
  }

  return violations;
}

function linkedMoveCodes(workspace: StudentWorkspace, rootCode: string): string[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [rootCode];
  const courses = courseIndex(curriculum);
  const pending = [rootCode];
  const result = new Set<string>();

  while (pending.length > 0) {
    const code = pending.pop() as string;
    if (result.has(code)) continue;
    result.add(code);
    const course = courses.get(code);
    for (const linked of course?.corequisites ?? []) {
      if (workspace.statuses[linked] !== 'passed') pending.push(linked);
    }
  }
  return [...result];
}

export interface MoveResult {
  ok: boolean;
  workspace: StudentWorkspace;
  movedCodes: string[];
  violations: PlanViolation[];
}

export function moveCourse(
  workspace: StudentWorkspace,
  courseCode: string,
  targetTermId: string,
): MoveResult {
  const curriculum = workspace.curriculum;
  if (!curriculum || !plannerTerms(workspace).some((term) => term.id === targetTermId)) {
    return { ok: false, workspace, movedCodes: [], violations: [] };
  }
  const status: CourseStatus = workspace.statuses[courseCode] ?? 'pending';
  if (status === 'passed' || status === 'active') {
    return {
      ok: false,
      workspace,
      movedCodes: [],
      violations: [
        {
          type: 'prerequisite',
          courseCode,
          relatedCode: courseCode,
          message: `${courseCode} is ${status} and cannot be moved.`,
          blocking: true,
        },
      ],
    };
  }

  const movedCodes = linkedMoveCodes(workspace, courseCode);
  const candidate: StudentWorkspace = {
    ...workspace,
    plan: {
      ...workspace.plan,
      ...Object.fromEntries(movedCodes.map((code) => [code, targetTermId])),
    },
    updatedAt: new Date().toISOString(),
  };
  const violations = validatePlan(candidate);
  const blocking = violations.filter((violation) => violation.blocking);

  return {
    ok: blocking.length === 0,
    workspace: blocking.length === 0 ? candidate : workspace,
    movedCodes,
    violations: blocking,
  };
}

export function applyMoves(
  workspace: StudentWorkspace,
  moves: MoveCommand[],
): MoveResult {
  let current = workspace;
  const moved = new Set<string>();
  for (const move of moves) {
    const result = moveCourse(current, move.courseCode, move.targetTermId);
    if (!result.ok) {
      return { ...result, workspace };
    }
    current = result.workspace;
    result.movedCodes.forEach((code) => moved.add(code));
  }
  return { ok: true, workspace: current, movedCodes: [...moved], violations: [] };
}

export function planWarnings(workspace: StudentWorkspace): PlanWarning[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const warnings: PlanWarning[] = [];
  const orders = termOrder(workspace);
  const included = plannedCodes(workspace);

  for (const term of plannerTerms(workspace)) {
    const units = termUnits(workspace, term.id);
    if (units > 0 && units < RECOMMENDED_MIN_UNITS) {
      warnings.push({
        type: 'underload',
        termId: term.id,
        message: `${term.label} has ${units} units — below the recommended ${RECOMMENDED_MIN_UNITS}.`,
      });
    }
    if (units > RECOMMENDED_MAX_UNITS) {
      warnings.push({
        type: 'overload',
        termId: term.id,
        message: `${term.label} has ${units} units — above the recommended ${RECOMMENDED_MAX_UNITS}.`,
      });
    }
  }

  for (const course of curriculum.courses) {
    if (!included.has(course.code)) continue;
    const planned = orders.get(workspace.plan[course.code]);
    const official = orders.get(course.originalTermId);
    if (planned !== undefined && official !== undefined && planned > official) {
      const hasDependents = curriculum.courses.some((candidate) =>
        candidate.prerequisites.includes(course.code),
      );
      if (hasDependents) {
        warnings.push({
          type: 'delayed-chain',
          courseCode: course.code,
          termId: workspace.plan[course.code],
          message: `${course.code} was moved later and may delay its prerequisite chain.`,
        });
      }
    }
  }

  validatePlan(workspace)
    .filter((violation) => violation.type === 'unknown-prerequisite')
    .forEach((violation) =>
      warnings.push({
        type: 'unknown-prerequisite',
        courseCode: violation.courseCode,
        message: violation.message,
      }),
    );

  return warnings;
}

export function updateCourseStatus(
  workspace: StudentWorkspace,
  courseCode: string,
  status: CourseStatus,
): StudentWorkspace {
  return {
    ...workspace,
    statuses: { ...workspace.statuses, [courseCode]: status },
    updatedAt: new Date().toISOString(),
  };
}

export function updateCourseBundleStatus(
  workspace: StudentWorkspace,
  courseCode: string,
  status: CourseStatus,
): StudentWorkspace {
  const codes = workspace.curriculum ? courseBundleCodes(workspace.curriculum, courseCode) : [courseCode];
  const nextPlanned = plannedCodes(workspace);
  const currentTermId = workspace.academicProfile?.currentTermId;
  const nextPlan = { ...workspace.plan };
  codes.forEach((code) => {
    if (status === 'active') {
      nextPlanned.add(code);
      if (currentTermId) nextPlan[code] = currentTermId;
    } else {
      nextPlanned.delete(code);
    }
  });
  return {
    ...workspace,
    plan: nextPlan,
    statuses: {
      ...workspace.statuses,
      ...Object.fromEntries(codes.map((code) => [code, status])),
    },
    plannedCourseCodes: [...nextPlanned],
    plannerTermIds: currentTermId
      ? [...new Set([...(workspace.plannerTermIds ?? []), currentTermId])]
      : workspace.plannerTermIds,
    updatedAt: new Date().toISOString(),
  };
}

export function copyCoursesToPlan(
  workspace: StudentWorkspace,
  courseCodes: string[],
): StudentWorkspace {
  const curriculum = workspace.curriculum;
  if (!curriculum) return workspace;
  const current = plannedCodes(workspace);
  const courses = courseIndex(curriculum);
  const pending = [...courseCodes];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const root = courses.get(pending.shift() as string);
    if (!root || visited.has(root.code)) continue;
    visited.add(root.code);
    current.add(root.code);
    [...root.linkedLaboratories, ...root.corequisites].forEach((code) => {
      current.add(code);
      const linked = courses.get(code);
      linked?.linkedLaboratories.forEach((labCode) => current.add(labCode));
      pending.push(code);
    });
  }
  const termIds = new Set(workspace.plannerTermIds ?? []);
  for (const code of current) {
    const course = courses.get(code);
    if (course) termIds.add(workspace.plan[code] ?? course.originalTermId);
  }
  return {
    ...workspace,
    plannedCourseCodes: [...current],
    plannerTermIds: curriculum.terms.filter((term) => termIds.has(term.id)).map((term) => term.id),
    updatedAt: new Date().toISOString(),
  };
}

export function addCourseToPlan(
  workspace: StudentWorkspace,
  courseCode: string,
  targetTermId: string,
): MoveResult {
  const curriculum = workspace.curriculum;
  if (!curriculum || !plannerTerms(workspace).some((term) => term.id === targetTermId)) {
    return { ok: false, workspace, movedCodes: [], violations: [] };
  }
  if (workspace.statuses[courseCode] === 'passed') {
    return {
      ok: false,
      workspace,
      movedCodes: [],
      violations: [{ type: 'prerequisite', courseCode, relatedCode: courseCode, message: `${courseCode} is already passed and stays in the Course Pool as completed.`, blocking: true }],
    };
  }
  const courses = courseIndex(curriculum);
  const root = courses.get(courseCode);
  if (!root) return { ok: false, workspace, movedCodes: [], violations: [] };
  const pending = [root.code];
  const added = new Set<string>();
  while (pending.length > 0) {
    const code = pending.pop() as string;
    if (added.has(code) || workspace.statuses[code] === 'passed') continue;
    added.add(code);
    const course = courses.get(code);
    course?.linkedLaboratories.forEach((linked) => pending.push(linked));
    course?.corequisites.forEach((linked) => pending.push(linked));
  }
  const included = plannedCodes(workspace);
  added.forEach((code) => included.add(code));
  const candidate: StudentWorkspace = {
    ...workspace,
    plannedCourseCodes: [...included],
    plan: { ...workspace.plan, ...Object.fromEntries([...added].map((code) => [code, targetTermId])) },
    updatedAt: new Date().toISOString(),
  };
  const violations = validatePlan(candidate).filter((violation) => violation.blocking);
  return { ok: violations.length === 0, workspace: violations.length === 0 ? candidate : workspace, movedCodes: [...added], violations };
}

export interface CoursePoolEligibility {
  available: boolean;
  missingPrerequisites: string[];
}

/**
 * Course Pool availability comes only from Academic Setup progress. Planned
 * future courses do not unlock later courses in the pool. Active prerequisites
 * count because they are the student's current courses and can feed the next
 * planned trimester. Lecture/lab and corequisite partners are evaluated as one
 * draggable bundle.
 */
export function coursePoolEligibility(
  workspace: StudentWorkspace,
  courseCode: string,
): CoursePoolEligibility {
  const curriculum = workspace.curriculum;
  if (!curriculum) return { available: false, missingPrerequisites: [] };
  const courses = courseIndex(curriculum);
  const pending = [courseCode];
  const bundle = new Set<string>();
  while (pending.length > 0) {
    const code = pending.pop() as string;
    for (const bundledCode of courseBundleCodes(curriculum, code)) {
      if (bundle.has(bundledCode)) continue;
      bundle.add(bundledCode);
      const course = courses.get(bundledCode);
      course?.corequisites.forEach((linked) => pending.push(linked));
    }
  }
  const missing = new Set<string>();
  bundle.forEach((code) => {
    courses.get(code)?.prerequisites.forEach((prerequisiteCode) => {
      if (bundle.has(prerequisiteCode)) return;
      const prerequisiteBundle = courseBundleCodes(curriculum, prerequisiteCode);
      const fulfilled = prerequisiteBundle.every((linkedCode) => {
        const status = workspace.statuses[linkedCode] ?? 'pending';
        return status === 'passed' || status === 'active';
      });
      if (!fulfilled) missing.add(prerequisiteCode);
    });
  });
  return { available: missing.size === 0, missingPrerequisites: [...missing].sort() };
}

export function addNextPlannerTerm(workspace: StudentWorkspace): StudentWorkspace {
  const curriculum = workspace.curriculum;
  if (!curriculum) return workspace;
  const terms = plannerTerms(workspace);
  const ids = workspace.plannerTermIds ?? [];
  const currentId = ids[ids.length - 1] ?? workspace.academicProfile?.currentTermId;
  const current = terms.find((term) => term.id === currentId) ?? curriculum.terms[0];
  if (!current) return workspace;
  let next = terms.find((term) => term.order === current.order + 1);
  let customPlannerTerms = workspace.customPlannerTerms ?? [];
  if (!next) {
    const term = current.term === 3 ? 1 : current.term + 1;
    const year = current.term === 3 ? current.year + 1 : current.year;
    next = { id: `custom-y${year}t${term}`, label: `Year ${year} · Term ${term}`, year, term, order: current.order + 1 };
    customPlannerTerms = [...customPlannerTerms, next];
  }
  if (ids.includes(next.id)) return workspace;
  return {
    ...workspace,
    customPlannerTerms,
    plannerTermIds: [...ids, next.id],
    updatedAt: new Date().toISOString(),
  };
}

export interface TatakCourseRecommendation {
  courseCode: string;
  targetTermId: string;
  reason: string;
}

export function tatakCourseRecommendations(workspace: StudentWorkspace, kind: Exclude<GoalKind, 'custom'>): TatakCourseRecommendation[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const targetTermId = (workspace.plannerTermIds ?? []).at(-1);
  if (!targetTermId) return [];
  const included = plannedCodes(workspace);
  const dependents = new Map(curriculum.courses.map((course) => [course.code, curriculum.courses.filter((candidate) => candidate.prerequisites.includes(course.code)).length]));
  const thesisCodes = new Set(curriculum.courses.filter((course) => /THESIS|CAPSTONE|PRACTICE AND DESIGN/i.test(course.title)).map((course) => course.code));
  const thesisAncestors = new Set<string>();
  const pending = [...thesisCodes];
  while (pending.length > 0) {
    const code = pending.pop() as string;
    const course = curriculum.courses.find((candidate) => candidate.code === code);
    for (const prerequisite of course?.prerequisites ?? []) {
      if (!thesisAncestors.has(prerequisite)) {
        thesisAncestors.add(prerequisite);
        pending.push(prerequisite);
      }
    }
  }
  return visibleCurriculumCourses(curriculum)
    .filter((course) => !included.has(course.code) && workspace.statuses[course.code] !== 'passed')
    .flatMap((course) => addCourseToPlan(workspace, course.code, targetTermId).ok ? [course] : [])
    .sort((left, right) => {
      if (kind === 'lighter_workload') return left.units - right.units || left.code.localeCompare(right.code);
      if (kind === 'thesis_readiness') return Number(!thesisAncestors.has(left.code)) - Number(!thesisAncestors.has(right.code)) || left.code.localeCompare(right.code);
      return (right.prerequisites.length + (dependents.get(right.code) ?? 0)) - (left.prerequisites.length + (dependents.get(left.code) ?? 0)) || left.code.localeCompare(right.code);
    })
    .slice(0, 4)
    .map((course) => ({
      courseCode: course.code,
      targetTermId,
      reason: kind === 'lighter_workload'
        ? `${course.units} units and currently valid for this term.`
        : kind === 'thesis_readiness'
          ? thesisAncestors.has(course.code) ? 'Builds the official Design / Thesis prerequisite pathway.' : 'A strictly valid supporting course for this term.'
          : `Unlocks ${dependents.get(course.code) ?? 0} later course${(dependents.get(course.code) ?? 0) === 1 ? '' : 's'} and is valid now.`,
    }));
}

export function removeCourseFromPlan(
  workspace: StudentWorkspace,
  courseCode: string,
): StudentWorkspace {
  const status = workspace.statuses[courseCode] ?? 'pending';
  if (status === 'passed' || status === 'active') return workspace;
  const curriculum = workspace.curriculum;
  if (!curriculum) return workspace;
  const remove = new Set(linkedMoveCodes(workspace, courseCode));
  const remaining = [...plannedCodes(workspace)].filter((code) => !remove.has(code));
  return { ...workspace, plannedCourseCodes: remaining, updatedAt: new Date().toISOString() };
}

export function addRetakeAttempt(
  workspace: StudentWorkspace,
  courseCode: string,
  targetTermId: string,
): StudentWorkspace {
  const curriculum = workspace.curriculum;
  if (!curriculum?.courses.some((course) => course.code === courseCode)) return workspace;
  if (!plannerTerms(workspace).some((term) => term.id === targetTermId)) return workspace;
  const attempt = {
    id: `retake-${courseCode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    courseCode,
    termId: targetTermId,
    status: 'pending' as const,
    grades: {},
    createdAt: new Date().toISOString(),
  };
  return {
    ...workspace,
    retakeAttempts: [...(workspace.retakeAttempts ?? []), attempt],
    plannerTermIds: [...new Set([...(workspace.plannerTermIds ?? []), targetTermId])],
    updatedAt: new Date().toISOString(),
  };
}

export function moveRetakeAttempt(
  workspace: StudentWorkspace,
  attemptId: string,
  targetTermId: string,
): MoveResult {
  const attempt = workspace.retakeAttempts?.find((candidate) => candidate.id === attemptId);
  const curriculum = workspace.curriculum;
  if (!attempt || !curriculum || !plannerTerms(workspace).some((term) => term.id === targetTermId) || attempt.status === 'passed' || attempt.status === 'active') {
    return { ok: false, workspace, movedCodes: [], violations: [] };
  }
  const course = courseIndex(curriculum).get(attempt.courseCode);
  const orders = termOrder(workspace);
  const targetOrder = orders.get(targetTermId) ?? Number.MAX_SAFE_INTEGER;
  const violations: PlanViolation[] = [];
  for (const prerequisiteCode of course?.prerequisites ?? []) {
    const passed = workspace.statuses[prerequisiteCode] === 'passed' ||
      (workspace.retakeAttempts ?? []).some(
        (item) => item.courseCode === prerequisiteCode && item.status === 'passed',
      );
    if (passed) continue;
    const regularOrder = plannedCodes(workspace).has(prerequisiteCode)
      ? orders.get(workspace.plan[prerequisiteCode])
      : undefined;
    const retakeOrder = (workspace.retakeAttempts ?? [])
      .filter((item) => item.courseCode === prerequisiteCode && item.id !== attemptId)
      .map((item) => orders.get(item.termId) ?? Number.MAX_SAFE_INTEGER)
      .sort((a, b) => a - b)[0];
    if ((regularOrder ?? Number.MAX_SAFE_INTEGER) >= targetOrder && (retakeOrder ?? Number.MAX_SAFE_INTEGER) >= targetOrder) {
      violations.push({
        type: 'prerequisite',
        courseCode: attempt.courseCode,
        relatedCode: prerequisiteCode,
        message: `${prerequisiteCode} must be passed or scheduled before this ${attempt.courseCode} retake.`,
        blocking: true,
      });
    }
  }
  if (violations.length > 0) return { ok: false, workspace, movedCodes: [], violations };
  const candidate: StudentWorkspace = {
    ...workspace,
    retakeAttempts: (workspace.retakeAttempts ?? []).map((item) =>
      item.id === attemptId ? { ...item, termId: targetTermId } : item,
    ),
    plannerTermIds: [...new Set([...(workspace.plannerTermIds ?? []), targetTermId])],
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, workspace: candidate, movedCodes: [attempt.courseCode], violations: [] };
}

export function updateRetakeAttempt(
  workspace: StudentWorkspace,
  attemptId: string,
  patch: { status?: CourseStatus; gradeCode?: string; grade?: number },
): StudentWorkspace {
  return {
    ...workspace,
    retakeAttempts: (workspace.retakeAttempts ?? []).map((attempt) => {
      if (attempt.id !== attemptId) return attempt;
      const grades = { ...attempt.grades };
      if (patch.gradeCode) {
        if (patch.grade === undefined) delete grades[patch.gradeCode];
        else grades[patch.gradeCode] = patch.grade;
      }
      return { ...attempt, status: patch.status ?? attempt.status, grades };
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function removeRetakeAttempt(
  workspace: StudentWorkspace,
  attemptId: string,
): StudentWorkspace {
  return {
    ...workspace,
    retakeAttempts: (workspace.retakeAttempts ?? []).filter((attempt) => attempt.id !== attemptId),
    updatedAt: new Date().toISOString(),
  };
}

export function dependentCourseCodes(curriculum: Curriculum, courseCode: string): string[] {
  return curriculum.courses
    .filter((course) => course.prerequisites.includes(courseCode))
    .map((course) => course.code);
}
