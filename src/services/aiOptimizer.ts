import { PlanSuggestion, StudentGoal, StudentWorkspace } from '../types';
import { applyMoves } from '../domain/planner';

export const aiOptimizerConfigured = Boolean(
  process.env.EXPO_PUBLIC_AI_OPTIMIZER_URL?.trim(),
);

export async function requestAiSuggestions(
  workspace: StudentWorkspace,
  goal: StudentGoal,
): Promise<PlanSuggestion[]> {
  const endpoint = process.env.EXPO_PUBLIC_AI_OPTIMIZER_URL?.trim();
  if (!endpoint) {
    throw new Error(
      'No AI optimizer endpoint is configured. Built-in goal hints still work on this device.',
    );
  }
  if (!workspace.curriculum) return [];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal,
      curriculum: {
        terms: workspace.curriculum.terms,
        courses: workspace.curriculum.courses.map((course) => ({
          code: course.code,
          title: course.title,
          units: course.units,
          prerequisites: course.prerequisites,
          corequisites: course.corequisites,
        })),
      },
      plan: workspace.plan,
      statuses: workspace.statuses,
      constraints: {
        prerequisites: 'hard',
        corequisites: 'hard',
        recommendedMinimumUnits: 12,
        recommendedMaximumUnits: 22,
      },
    }),
  });
  if (!response.ok) throw new Error(`AI optimizer returned HTTP ${response.status}.`);

  const body = (await response.json()) as { suggestions?: PlanSuggestion[] };
  if (!Array.isArray(body.suggestions)) {
    throw new Error('AI optimizer response did not contain a suggestions array.');
  }

  const courseCodes = new Set(workspace.curriculum.courses.map((course) => course.code));
  const termIds = new Set(workspace.curriculum.terms.map((term) => term.id));
  return body.suggestions.filter(
    (suggestion) =>
      typeof suggestion.id === 'string' &&
      typeof suggestion.title === 'string' &&
      Array.isArray(suggestion.moves) &&
      suggestion.moves.every(
        (move) => courseCodes.has(move.courseCode) && termIds.has(move.targetTermId),
      )
      && applyMoves(workspace, suggestion.moves).ok,
  );
}
