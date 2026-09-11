import { Course } from '../types';
import type {
  CourseImportance,
  CourseMilestoneKind,
  CurriculumFieldId,
  CurriculumGraphEdge,
  CurriculumGraphMetrics,
} from './curriculumGraph';

export interface AnalyzedCourse {
  course: Course;
  fieldId: CurriculumFieldId;
  metrics: CurriculumGraphMetrics;
  importanceScore: number;
  importance: CourseImportance;
  milestoneKind: CourseMilestoneKind;
}

export interface CurriculumGraphAnalysis {
  courses: Map<string, AnalyzedCourse>;
  topologicalOrder: string[];
  cycles: string[][];
  validationErrors: string[];
}

const logarithmicNormalize = (value: number, maximum: number) =>
  maximum <= 0 ? 0 : Math.log1p(value) / Math.log1p(maximum);

function findCycles(courseCodes: string[], dependents: Map<string, string[]>): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (code: string) => {
    state.set(code, 1);
    stack.push(code);
    for (const dependent of dependents.get(code) ?? []) {
      if ((state.get(dependent) ?? 0) === 0) visit(dependent);
      else if (state.get(dependent) === 1) {
        const start = stack.lastIndexOf(dependent);
        const cycle = [...stack.slice(start), dependent];
        const canonical = [...new Set(cycle.slice(0, -1))].sort().join('|');
        if (!seen.has(canonical)) {
          seen.add(canonical);
          cycles.push(cycle);
        }
      }
    }
    stack.pop();
    state.set(code, 2);
  };

  courseCodes.forEach((code) => { if ((state.get(code) ?? 0) === 0) visit(code); });
  return cycles;
}

function allDescendants(start: string, dependents: Map<string, string[]>): Set<string> {
  const result = new Set<string>();
  const pending = [...(dependents.get(start) ?? [])];
  while (pending.length > 0) {
    const code = pending.pop() as string;
    if (result.has(code) || code === start) continue;
    result.add(code);
    pending.push(...(dependents.get(code) ?? []));
  }
  return result;
}

function milestoneKind(course: Course): CourseMilestoneKind {
  const text = `${course.title} ${course.description ?? ''}`.toUpperCase();
  if (/INTERNSHIP|\bOJT\b|ON[- ]THE[- ]JOB/.test(text)) return 'internship';
  if (/\bTHESIS\b|TERMINAL PROJECT|PRACTICE AND DESIGN|\bCAPSTONE\b/.test(text)) return 'thesis';
  return null;
}

function milestoneWeight(course: Course, fieldId: CurriculumFieldId, kind: CourseMilestoneKind): number {
  const text = `${course.title} ${course.description ?? ''}`.toUpperCase();
  if (kind === 'thesis') return 1;
  if (kind === 'internship') return 0.9;
  if (/MAJOR DESIGN|DESIGN PROJECT|PROJECT DEVELOPMENT/.test(text)) return 0.5;
  if (['cpe-core', 'hardware-embedded', 'circuits-electronics', 'networks-systems', 'programming-software'].includes(fieldId)) return 0.25;
  return 0;
}

function distancesToTargets(targets: string[], prerequisites: Map<string, string[]>): Map<string, number> {
  const distances = new Map<string, number>();
  const queue = targets.map((code) => ({ code, distance: 0 }));
  while (queue.length > 0) {
    const current = queue.shift() as { code: string; distance: number };
    const known = distances.get(current.code);
    if (known !== undefined && known <= current.distance) continue;
    distances.set(current.code, current.distance);
    (prerequisites.get(current.code) ?? []).forEach((code) => queue.push({ code, distance: current.distance + 1 }));
  }
  return distances;
}

function importanceTier(score: number, milestone: number): CourseImportance {
  if (milestone >= 0.7 || score > 0.75) return 'major';
  if (milestone >= 0.5 || score >= 0.55) return 'large';
  if (score >= 0.3) return 'medium';
  return 'normal';
}

export function analyzeCurriculumGraph(
  courses: Course[],
  edges: CurriculumGraphEdge[],
  fields: Map<string, CurriculumFieldId>,
  termOrder: Map<string, number>,
): CurriculumGraphAnalysis {
  const codes = courses.map((course) => course.code);
  const visible = new Set(codes);
  const prerequisites = new Map(codes.map((code) => [code, [] as string[]]));
  const dependents = new Map(codes.map((code) => [code, [] as string[]]));
  edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
    if (!visible.has(edge.sourceCode) || !visible.has(edge.targetCode)) return;
    prerequisites.get(edge.targetCode)?.push(edge.sourceCode);
    dependents.get(edge.sourceCode)?.push(edge.targetCode);
  });

  const cycles = findCycles(codes, dependents);
  const cyclicCodes = new Set(cycles.flat());
  const indegree = new Map(codes.map((code) => [code, prerequisites.get(code)?.length ?? 0]));
  const compareCodes = (left: string, right: string) => {
    const a = courses.find((course) => course.code === left);
    const b = courses.find((course) => course.code === right);
    return (termOrder.get(a?.originalTermId ?? '') ?? 999) - (termOrder.get(b?.originalTermId ?? '') ?? 999)
      || left.localeCompare(right);
  };
  const sorted = (items: string[]) => [...items].sort(compareCodes);
  const queue = sorted(codes.filter((code) => indegree.get(code) === 0));
  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const code = queue.shift() as string;
    topologicalOrder.push(code);
    for (const dependent of dependents.get(code) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 1) - 1);
      if (indegree.get(dependent) === 0) {
        queue.push(dependent);
        queue.sort(compareCodes);
      }
    }
  }
  const unresolved = sorted(codes.filter((code) => !topologicalOrder.includes(code)));
  topologicalOrder.push(...unresolved);

  const prerequisiteDepth = new Map(codes.map((code) => [code, 0]));
  topologicalOrder.forEach((code) => {
    if (cyclicCodes.has(code)) return;
    const parents = prerequisites.get(code) ?? [];
    prerequisiteDepth.set(code, parents.length === 0 ? 0 : Math.max(...parents.map((parent) => prerequisiteDepth.get(parent) ?? 0)) + 1);
  });
  unresolved.forEach((code) => {
    const nonCyclicParents = (prerequisites.get(code) ?? []).filter((parent) => !cyclicCodes.has(parent));
    prerequisiteDepth.set(code, nonCyclicParents.length === 0 ? 0 : Math.max(...nonCyclicParents.map((parent) => prerequisiteDepth.get(parent) ?? 0)) + 1);
  });

  const downstreamDepth = new Map(codes.map((code) => [code, 0]));
  [...topologicalOrder].reverse().forEach((code) => {
    if (cyclicCodes.has(code)) return;
    const children = (dependents.get(code) ?? []).filter((child) => !cyclicCodes.has(child));
    downstreamDepth.set(code, children.length === 0 ? 0 : Math.max(...children.map((child) => downstreamDepth.get(child) ?? 0)) + 1);
  });

  const milestoneKinds = new Map(courses.map((course) => [course.code, milestoneKind(course)]));
  const thesisDistances = distancesToTargets(codes.filter((code) => milestoneKinds.get(code) === 'thesis'), prerequisites);
  const internshipDistances = distancesToTargets(codes.filter((code) => milestoneKinds.get(code) === 'internship'), prerequisites);

  const raw = courses.map((course) => {
    const fieldId = fields.get(course.code) ?? 'general-communication';
    const direct = new Set(dependents.get(course.code) ?? []).size;
    const descendants = allDescendants(course.code, dependents);
    const neighborFields = new Set([
      ...(prerequisites.get(course.code) ?? []).map((code) => fields.get(code)),
      ...(dependents.get(course.code) ?? []).map((code) => fields.get(code)),
    ].filter((field): field is CurriculumFieldId => Boolean(field && field !== fieldId)));
    const crossFieldDirect = [...(prerequisites.get(course.code) ?? []), ...(dependents.get(course.code) ?? [])]
      .filter((code) => fields.get(code) && fields.get(code) !== fieldId).length;
    const downstreamFields = new Set([...descendants].map((code) => fields.get(code)).filter((field) => field && field !== fieldId));
    const bridgeRaw = crossFieldDirect * 1.5 + neighborFields.size + downstreamFields.size * 0.35
      + Math.max(0, (prerequisites.get(course.code)?.length ?? 0) - 1) * 0.5;
    const kind = milestoneKinds.get(course.code) ?? null;
    return {
      course,
      fieldId,
      directDependents: direct,
      downstreamCount: descendants.size,
      prerequisiteDepth: prerequisiteDepth.get(course.code) ?? 0,
      downstreamDepth: downstreamDepth.get(course.code) ?? 0,
      bridgeRaw,
      milestoneKind: kind,
      milestoneWeight: milestoneWeight(course, fieldId, kind),
      distanceToThesis: thesisDistances.get(course.code) ?? null,
      distanceToInternship: internshipDistances.get(course.code) ?? null,
    };
  });
  const maxima = {
    direct: Math.max(0, ...raw.map((item) => item.directDependents)),
    downstream: Math.max(0, ...raw.map((item) => item.downstreamCount)),
    depth: Math.max(0, ...raw.map((item) => item.downstreamDepth)),
    bridge: Math.max(0, ...raw.map((item) => item.bridgeRaw)),
  };

  const analyzed = new Map<string, AnalyzedCourse>();
  raw.forEach((item) => {
    const normalizedDirect = logarithmicNormalize(item.directDependents, maxima.direct);
    const normalizedDownstream = logarithmicNormalize(item.downstreamCount, maxima.downstream);
    const normalizedDepth = maxima.depth === 0 ? 0 : item.downstreamDepth / maxima.depth;
    const bridgeScore = logarithmicNormalize(item.bridgeRaw, maxima.bridge);
    const thesisProximity = item.distanceToThesis === null ? 0 : 1 / (1 + item.distanceToThesis * 0.5);
    const internshipProximity = item.distanceToInternship === null ? 0 : 1 / (1 + item.distanceToInternship * 0.6);
    const importanceScore = Math.min(1,
      0.2 * normalizedDirect
      + 0.25 * normalizedDownstream
      + 0.2 * normalizedDepth
      + 0.15 * bridgeScore
      + 0.2 * item.milestoneWeight
      + 0.08 * thesisProximity
      + 0.035 * internshipProximity,
    );
    const metrics: CurriculumGraphMetrics = {
      directDependents: item.directDependents,
      downstreamCount: item.downstreamCount,
      prerequisiteDepth: item.prerequisiteDepth,
      downstreamDepth: item.downstreamDepth,
      bridgeScore,
      milestoneWeight: item.milestoneWeight,
      isThesisAncestor: item.distanceToThesis !== null && item.distanceToThesis > 0,
      distanceToThesis: item.distanceToThesis,
      isInternshipAncestor: item.distanceToInternship !== null && item.distanceToInternship > 0,
      distanceToInternship: item.distanceToInternship,
    };
    analyzed.set(item.course.code, {
      course: item.course,
      fieldId: item.fieldId,
      metrics,
      importanceScore,
      importance: importanceTier(importanceScore, item.milestoneWeight),
      milestoneKind: item.milestoneKind,
    });
  });

  return {
    courses: analyzed,
    topologicalOrder,
    cycles,
    validationErrors: cycles.map((cycle) => `Prerequisite cycle detected: ${cycle.join(' → ')}`),
  };
}
