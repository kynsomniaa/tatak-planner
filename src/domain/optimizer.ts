import { applyMoves, moveCourse, termUnits } from './planner';
import { Course, PlanSuggestion, StudentGoal, StudentWorkspace } from '../types';
import { isThesisOrDesignCourse } from './curriculumRules';

const thesisCourse = (course: Course, program?: string): boolean => isThesisOrDesignCourse(course.title, program);

function earliestSafeTerm(
  workspace: StudentWorkspace,
  courseCode: string,
  beforeOrder: number,
): string | null {
  const curriculum = workspace.curriculum;
  if (!curriculum) return null;
  for (const term of curriculum.terms) {
    if (term.order >= beforeOrder) break;
    const result = moveCourse(workspace, courseCode, term.id);
    if (result.ok && termUnits(result.workspace, term.id) <= 22) return term.id;
  }
  return null;
}

function earliestGraduationHints(workspace: StudentWorkspace): PlanSuggestion[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const termById = new Map(curriculum.terms.map((term) => [term.id, term]));
  const hints: PlanSuggestion[] = [];

  for (const course of [...curriculum.courses].reverse()) {
    if (workspace.statuses[course.code] === 'passed') continue;
    const current = termById.get(workspace.plan[course.code]);
    if (!current) continue;
    const targetId = earliestSafeTerm(workspace, course.code, current.order);
    if (!targetId) continue;
    const target = termById.get(targetId);
    hints.push({
      id: `early-${course.code}-${targetId}`,
      title: `Take ${course.code} earlier`,
      detail: `${course.title} can move to ${target?.label} without breaking prerequisite or lab rules.`,
      impact: `Advances this course by ${current.order - (target?.order ?? current.order)} trimester(s).`,
      moves: [{ courseCode: course.code, targetTermId: targetId }],
    });
    if (hints.length >= 3) break;
  }
  return hints;
}

function lighterWorkloadHints(workspace: StudentWorkspace): PlanSuggestion[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const loadedTerms = curriculum.terms
    .map((term) => ({ term, units: termUnits(workspace, term.id) }))
    .filter(({ units }) => units > 18)
    .sort((a, b) => b.units - a.units);

  for (const loaded of loadedTerms) {
    const candidates = curriculum.courses
      .filter(
        (course) =>
          workspace.plan[course.code] === loaded.term.id &&
          workspace.statuses[course.code] !== 'passed' &&
          !thesisCourse(course, curriculum.program),
      )
      .sort((a, b) => b.units - a.units);
    for (const target of curriculum.terms.filter((term) => term.order > loaded.term.order)) {
      for (const course of candidates) {
        const result = moveCourse(workspace, course.code, target.id);
        if (!result.ok || termUnits(result.workspace, target.id) > 22) continue;
        return [
          {
            id: `light-${course.code}-${target.id}`,
            title: `Lighten ${loaded.term.label}`,
            detail: `Move ${course.code} (${course.units} units) to ${target.label}.`,
            impact: `${loaded.term.label} falls from ${loaded.units} to about ${termUnits(
              result.workspace,
              loaded.term.id,
            )} units.`,
            moves: [{ courseCode: course.code, targetTermId: target.id }],
          },
        ];
      }
    }
  }
  return [];
}

function thesisReadinessHints(workspace: StudentWorkspace): PlanSuggestion[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const thesisCourses = curriculum.courses.filter((course) => thesisCourse(course, curriculum.program));
  const chain = new Set<string>();

  const visit = (code: string) => {
    if (chain.has(code)) return;
    chain.add(code);
    byCode.get(code)?.prerequisites.forEach(visit);
  };
  thesisCourses.forEach((course) => visit(course.code));

  const pending = curriculum.courses.filter(
    (course) => chain.has(course.code) && workspace.statuses[course.code] !== 'passed',
  );
  const base = earliestGraduationHints(workspace).filter((hint) =>
    pending.some((course) => hint.moves.some((move) => move.courseCode === course.code)),
  );
  if (base.length > 0) {
    return base.map((hint) => ({
      ...hint,
      id: `thesis-${hint.id}`,
      title: `Protect the thesis chain: ${hint.title}`,
    }));
  }

  const next = pending[0];
  if (!next) return [];
  return [
    {
      id: `thesis-focus-${next.code}`,
      title: `Prioritize ${next.code}`,
      detail: `${next.title} is in the prerequisite chain leading to ${thesisCourses
        .map((course) => course.code)
        .join(' and ')}.`,
      impact: 'Completing it protects thesis readiness even when no safe earlier move is available.',
      moves: [],
    },
  ];
}

export function goalSuggestions(
  workspace: StudentWorkspace,
  goal: StudentGoal | undefined,
): PlanSuggestion[] {
  if (!goal || goal.kind === 'custom') return [];
  const generated = goal.kind === 'earliest_graduation'
    ? earliestGraduationHints(workspace)
    : goal.kind === 'lighter_workload'
      ? lighterWorkloadHints(workspace)
      : thesisReadinessHints(workspace);
  return generated.filter((suggestion) => suggestion.moves.length === 0 || applyMoves(workspace, suggestion.moves).ok);
}
