import { Course, CourseRating, Curriculum, StudentWorkspace } from '../types';
import { laboratoryParentIndex, visibleCurriculumCourses } from './academicSetup';
import { availableCourseCodesForRaid, buildCurriculumGraph } from './curriculumGraph';
import { getMissingPrerequisites } from './academicProgress';
import { isInternshipCourse, isThesisOrDesignCourse } from './curriculumRules';

export type RaidStrategyKind = 'thesis' | 'internship' | 'lighter';

export interface RaidStrategyRatingSignal {
  criterion: 'Difficulty' | 'Workload';
  average: number;
  count: number;
}

export interface RaidStrategyRecommendation {
  courseCode: string;
  courseTitle: string;
  reason: string;
  signal: string;
  /** Exact graph-derived path used by Show Path on Map. */
  strategicPath: string[];
  /** A compact 3–4-course explanation; the ellipsis is never used for map focus. */
  displayPath: string[];
  pathText?: string;
  milestoneCode?: string;
  impact?: string;
  rating?: RaidStrategyRatingSignal;
  bottlenecksAffected?: number;
  remainingBottlenecks?: number;
  relationship: 'feeder' | 'direct' | 'milestone' | 'ancestry' | 'workload';
  eligible: boolean;
  missingPrerequisites: string[];
  availabilityText: string;
}

interface StrategyGraph {
  byCode: Map<string, Course>;
  prerequisites: Map<string, string[]>;
  dependents: Map<string, string[]>;
  importance: Map<string, number>;
  milestoneAncestors: Set<string>;
}

function targetCourses(curriculum: Curriculum, kind: RaidStrategyKind) {
  const visible = visibleCurriculumCourses(curriculum);
  const matches = kind === 'thesis'
    ? visible.filter((course) => isThesisOrDesignCourse(course.title, curriculum.program))
    : kind === 'internship'
      ? visible.filter((course) => isInternshipCourse(course.title))
      : [];
  if (matches.length < 2) return matches;
  const matchCodes = new Set(matches.map((course) => course.code));
  const labParents = laboratoryParentIndex(curriculum);
  const terminal = matches.filter((candidate) => !matches.some((other) => other.code !== candidate.code
    && other.prerequisites.map((code) => labParents.get(code) ?? code).some((code) => code === candidate.code && matchCodes.has(code))));
  return terminal.length > 0 ? terminal : matches;
}

export function strategyTargetCodes(curriculum: Curriculum, kind: RaidStrategyKind): string[] {
  return targetCourses(curriculum, kind).map((course) => course.code);
}

function buildStrategyGraph(curriculum: Curriculum, targets: string[]): StrategyGraph {
  const courses = visibleCurriculumCourses(curriculum);
  const byCode = new Map(courses.map((course) => [course.code, course]));
  const labParents = laboratoryParentIndex(curriculum);
  const normalize = (code: string) => labParents.get(code) ?? code;
  const prerequisites = new Map(courses.map((course) => [course.code, [] as string[]]));
  const dependents = new Map(courses.map((course) => [course.code, [] as string[]]));
  courses.forEach((course) => {
    const parents = [...new Set(course.prerequisites.map(normalize).filter((code) => code !== course.code && byCode.has(code)))];
    prerequisites.set(course.code, parents);
    parents.forEach((parent) => dependents.set(parent, [...(dependents.get(parent) ?? []), course.code]));
  });
  const layout = buildCurriculumGraph(curriculum);
  const importance = new Map(layout.nodes.map((node) => [node.course.code, node.importanceScore]));
  const milestoneAncestors = new Set<string>();
  const pending = [...targets];
  while (pending.length > 0) {
    const code = pending.pop() as string;
    if (milestoneAncestors.has(code)) continue;
    milestoneAncestors.add(code);
    pending.push(...(prerequisites.get(code) ?? []));
  }
  return { byCode, prerequisites, dependents, importance, milestoneAncestors };
}

function statusResolved(workspace: StudentWorkspace, code: string) {
  return workspace.statuses[code] === 'passed' || workspace.statuses[code] === 'active';
}

function collectReachable(start: string, dependents: Map<string, string[]>, allowed?: Set<string>) {
  const result = new Set<string>();
  const pending = [...(dependents.get(start) ?? [])];
  while (pending.length > 0) {
    const code = pending.pop() as string;
    if (result.has(code) || (allowed && !allowed.has(code))) continue;
    result.add(code);
    pending.push(...(dependents.get(code) ?? []));
  }
  return result;
}

function enumerateMilestonePaths(start: string, targets: Set<string>, graph: StrategyGraph) {
  const paths: string[][] = [];
  const visit = (code: string, path: string[]) => {
    if (path.length > 16 || path.slice(0, -1).includes(code)) return;
    if (targets.has(code)) paths.push(path);
    for (const child of graph.dependents.get(code) ?? []) {
      if (graph.milestoneAncestors.has(child)) visit(child, [...path, child]);
    }
  };
  visit(start, [start]);
  return paths;
}

function pathScore(path: string[], graph: StrategyGraph, workspace: StudentWorkspace, curriculum: Curriculum) {
  const termOrder = new Map(curriculum.terms.map((term) => [term.id, term.order]));
  const maxTerm = Math.max(1, ...termOrder.values());
  const endpoint = graph.byCode.get(path.at(-1) ?? '');
  const endpointProgress = (termOrder.get(endpoint?.originalTermId ?? '') ?? 0) / maxTerm;
  const importance = path.reduce((sum, code) => sum + (graph.importance.get(code) ?? 0), 0) / Math.max(1, path.length);
  const unfinished = path.filter((code) => !statusResolved(workspace, code)).length / Math.max(1, path.length);
  return endpointProgress * 0.9 + importance * 0.7 + unfinished * 0.35 - path.length * 0.055;
}

/** Finds a real, strategically useful directed path without hardcoded course chains. */
export function findStrategicPath(
  curriculum: Curriculum,
  workspace: StudentWorkspace,
  recommendationCode: string,
  targetCodes: string[],
): string[] {
  const graph = buildStrategyGraph(curriculum, targetCodes);
  const paths = enumerateMilestonePaths(recommendationCode, new Set(targetCodes), graph);
  return paths.sort((left, right) => pathScore(right, graph, workspace, curriculum) - pathScore(left, graph, workspace, curriculum)
    || left.length - right.length
    || left.join('|').localeCompare(right.join('|')))[0] ?? [];
}

function remainingBottlenecks(graph: StrategyGraph, workspace: StudentWorkspace, targets: Set<string>) {
  const bottlenecks = new Set<string>();
  graph.milestoneAncestors.forEach((code) => {
    if (targets.has(code) || statusResolved(workspace, code)) return;
    const pathChildren = (graph.dependents.get(code) ?? []).filter((child) => graph.milestoneAncestors.has(child) && !statusResolved(workspace, child));
    const downstream = collectReachable(code, graph.dependents, graph.milestoneAncestors);
    const directMilestone = pathChildren.some((child) => targets.has(child));
    const opensNext = pathChildren.some((child) => (graph.prerequisites.get(child) ?? []).filter((parent) => parent !== code && !statusResolved(workspace, parent)).length === 0);
    const course = graph.byCode.get(code);
    const gateway = course?.courseRole === 'core_gateway' || course?.courseRole === 'foundation' || (graph.importance.get(code) ?? 0) >= 0.55;
    if (directMilestone || opensNext || pathChildren.length >= 2 || (gateway && downstream.size >= 2)) bottlenecks.add(code);
  });
  return bottlenecks;
}

function compactPath(path: string[], importance: Map<string, number>) {
  if (path.length <= 4) return path;
  const penultimate = path.at(-2) as string;
  const middle = path.slice(1, -2).sort((left, right) => (importance.get(right) ?? 0) - (importance.get(left) ?? 0) || left.localeCompare(right))[0];
  return middle && middle !== penultimate
    ? [path[0], middle, '…', penultimate, path.at(-1) as string]
    : [path[0], '…', penultimate, path.at(-1) as string];
}

function pathText(displayPath: string[], graph: StrategyGraph) {
  return displayPath.map((code, index) => {
    if (code === '…') return code;
    const course = graph.byCode.get(code);
    if (!course) return code;
    return index === displayPath.length - 1 ? `${code} · ${course.title}` : code;
  }).join(' → ');
}

function ratingSignal(ratings: CourseRating[], courseCode: string, criterion: 'Difficulty' | 'Workload'): RaidStrategyRatingSignal | undefined {
  const values = ratings.filter((rating) => !rating.hidden && rating.courseCode === courseCode)
    .map((rating) => criterion === 'Difficulty' ? rating.difficulty : rating.workload);
  if (values.length === 0) return undefined;
  return { criterion, average: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length };
}

function recommendationImpact(
  recommendationCode: string,
  path: string[],
  graph: StrategyGraph,
  workspace: StudentWorkspace,
  targets: Set<string>,
  label: string,
  relationship: RaidStrategyRecommendation['relationship'],
  feederCoverage: number,
  eligible: boolean,
) {
  const bottlenecks = remainingBottlenecks(graph, workspace, targets);
  const affected = bottlenecks.has(recommendationCode) ? 1 : 0;
  const unlocked = (graph.dependents.get(recommendationCode) ?? []).filter((child) => graph.milestoneAncestors.has(child)
    && !statusResolved(workspace, child)
    && (graph.prerequisites.get(child) ?? []).every((parent) => parent === recommendationCode || statusResolved(workspace, parent))).length;
  if (targets.has(recommendationCode)) return { text: eligible ? `This is the eligible ${label} milestone for this raid.` : `This is the final ${label} milestone; its unfinished prerequisite chain must be cleared first.`, affected, total: bottlenecks.size };
  if (affected > 0) return { text: `Removes ${affected} of ${bottlenecks.size} remaining ${label} bottleneck${bottlenecks.size === 1 ? '' : 's'}.`, affected, total: bottlenecks.size };
  if (relationship === 'feeder') return { text: `Feeds ${Math.max(1, feederCoverage)} unfinished ${label} prerequisite branch${feederCoverage === 1 ? '' : 'es'}.`, affected, total: bottlenecks.size };
  if (path.length === 2) return { text: `Clears the final prerequisite before ${label} eligibility.`, affected, total: bottlenecks.size };
  if (unlocked > 0) return { text: `Unlocks ${unlocked} course${unlocked === 1 ? '' : 's'} on the ${label} pathway.`, affected, total: bottlenecks.size };
  const downstream = collectReachable(recommendationCode, graph.dependents, graph.milestoneAncestors).size;
  return { text: `Foundation course for ${downstream} remaining course${downstream === 1 ? '' : 's'} on this pathway.`, affected, total: bottlenecks.size };
}

function workloadRatings(ratings: CourseRating[]) {
  const totals = new Map<string, { total: number; count: number }>();
  ratings.filter((rating) => !rating.hidden).forEach((rating) => {
    const current = totals.get(rating.courseCode) ?? { total: 0, count: 0 };
    current.total += rating.workload;
    current.count += 1;
    totals.set(rating.courseCode, current);
  });
  return totals;
}

function relationshipFor(
  code: string,
  targets: Set<string>,
  directPrerequisites: Set<string>,
  feederPrerequisites: Set<string>,
): RaidStrategyRecommendation['relationship'] {
  if (feederPrerequisites.has(code)) return 'feeder';
  if (directPrerequisites.has(code)) return 'direct';
  if (targets.has(code)) return 'milestone';
  return 'ancestry';
}

function availabilityText(graph: StrategyGraph, eligible: boolean, missing: string[]) {
  if (eligible) return 'Eligible now · prerequisites cleared';
  if (missing.length === 0) return 'Not available for this raid yet.';
  return `Locked · missing ${missing.map((code) => `${code} — ${graph.byCode.get(code)?.title ?? 'Course not found'}`).join('; ')}`;
}

export function raidStrategyRecommendations(
  workspace: StudentWorkspace,
  termId: string,
  kind: RaidStrategyKind,
  ratings: CourseRating[],
): RaidStrategyRecommendation[] {
  const curriculum = workspace.curriculum;
  if (!curriculum) return [];
  const available = availableCourseCodesForRaid(workspace, termId);
  const planned = new Set(workspace.plannedCourseCodes ?? []);
  const visible = visibleCurriculumCourses(curriculum);
  const candidates = visible.filter((course) => available.has(course.code)
    && workspace.statuses[course.code] !== 'passed'
    && workspace.statuses[course.code] !== 'active');
  if (kind === 'lighter') {
    const workload = workloadRatings(ratings);
    return candidates.map((course) => {
      const rating = workload.get(course.code);
      const reliable = Boolean(rating && rating.count >= 3);
      const structuralScore = course.units * 1.4 + (course.linkedLaboratories.length > 0 ? 1.4 : 0) + course.prerequisites.length * 0.2;
      const score = reliable ? (rating!.total / rating!.count) * 2 + course.units * 0.35 : 10 + structuralScore;
      return {
        course,
        score,
        recommendation: {
          courseCode: course.code,
          courseTitle: course.title,
          reason: reliable
            ? `Community workload ${Number(rating!.total / rating!.count).toFixed(1)}/5 from ${rating!.count} ratings; ${course.units} units.`
            : `${course.units} units${course.linkedLaboratories.length ? ' with a linked laboratory' : ' with no linked laboratory'}. No reliable community workload rating yet.`,
          signal: reliable ? 'Community workload signal' : 'Conservative unit/lab heuristic',
          strategicPath: [],
          displayPath: [],
          rating: ratingSignal(ratings, course.code, 'Workload'),
          relationship: 'workload' as const,
          eligible: true,
          missingPrerequisites: [],
          availabilityText: 'Eligible now · prerequisites cleared',
        },
      };
    }).sort((left, right) => left.score - right.score || left.course.code.localeCompare(right.course.code)).slice(0, 5).map((item) => item.recommendation);
  }

  const targets = targetCourses(curriculum, kind);
  const targetCodes = targets.map((course) => course.code);
  const targetSet = new Set(targetCodes);
  const graph = buildStrategyGraph(curriculum, targetCodes);
  const label = kind === 'thesis' ? 'Thesis' : 'Internship';
  const directPrerequisites = new Set(targetCodes.flatMap((code) => graph.prerequisites.get(code) ?? []));
  const feederPrerequisites = new Set([...directPrerequisites].flatMap((code) => graph.prerequisites.get(code) ?? []));
  const remaining = remainingBottlenecks(graph, workspace, targetSet);
  const strategicCandidates = visible.filter((course) => {
    if (!graph.milestoneAncestors.has(course.code) || statusResolved(workspace, course.code) || planned.has(course.code)) return false;
    const missing = getMissingPrerequisites(curriculum, workspace.statuses, course.code, 'active');
    return available.has(course.code)
      || feederPrerequisites.has(course.code)
      || directPrerequisites.has(course.code)
      || targetSet.has(course.code)
      || missing.length <= 2;
  });
  const reachFor = (code: string) => collectReachable(code, graph.dependents, graph.milestoneAncestors).size;
  const coverageFor = (code: string) => [...directPrerequisites].filter((direct) => !statusResolved(workspace, direct)
    && (direct === code || collectReachable(code, graph.dependents).has(direct))).length;
  const maximumReach = Math.max(1, ...strategicCandidates.map((course) => reachFor(course.code)));
  const maximumCoverage = Math.max(1, ...strategicCandidates.map((course) => coverageFor(course.code)));
  return strategicCandidates.flatMap((course) => {
    const path = enumerateMilestonePaths(course.code, targetSet, graph)
      .sort((left, right) => pathScore(right, graph, workspace, curriculum) - pathScore(left, graph, workspace, curriculum)
        || left.length - right.length
        || left.join('|').localeCompare(right.join('|')))[0];
    if (!path) return [];
    const eligible = available.has(course.code);
    const missingPrerequisites = eligible ? [] : getMissingPrerequisites(curriculum, workspace.statuses, course.code, 'active');
    const relationship = relationshipFor(course.code, targetSet, directPrerequisites, feederPrerequisites);
    const feederCoverage = coverageFor(course.code);
    const impact = recommendationImpact(course.code, path, graph, workspace, targetSet, label, relationship, feederCoverage, eligible);
    const reach = reachFor(course.code);
    const pathImportance = path.reduce((sum, code) => sum + (graph.importance.get(code) ?? 0), 0) / Math.max(1, path.length);
    const relationshipPriority = relationship === 'feeder' ? 1 : relationship === 'direct' ? 0.72 : relationship === 'milestone' ? 0.58 : 0.45;
    const availabilityPriority = eligible ? 1 : missingPrerequisites.length === 1 ? 0.65 : missingPrerequisites.length === 2 ? 0.35 : 0.08;
    const score = 0.40 * relationshipPriority
      + 0.38 * availabilityPriority
      + 0.07 * (impact.affected / Math.max(1, impact.total))
      + 0.08 * (feederCoverage / maximumCoverage)
      + 0.04 * (reach / maximumReach)
      + 0.03 * pathImportance;
    const displayPath = compactPath(path, graph.importance);
    const recommendation: RaidStrategyRecommendation = {
      courseCode: course.code,
      courseTitle: course.title,
      reason: eligible
        ? `${course.title} is an eligible next step on the ${label} pathway.`
        : `${course.title} is a strategic ${label} pathway course, but it is not eligible yet.`,
      signal: eligible
        ? `${label} ancestry · currently eligible`
        : `${label} ancestry · locked by ${missingPrerequisites.length} prerequisite${missingPrerequisites.length === 1 ? '' : 's'}`,
      strategicPath: path,
      displayPath,
      pathText: pathText(displayPath, graph),
      milestoneCode: path.at(-1),
      impact: impact.text,
      rating: ratingSignal(ratings, course.code, 'Difficulty'),
      bottlenecksAffected: impact.affected,
      remainingBottlenecks: remaining.size,
      relationship,
      eligible,
      missingPrerequisites,
      availabilityText: availabilityText(graph, eligible, missingPrerequisites),
    };
    return [{ recommendation, score }];
  }).sort((left, right) => Number(right.recommendation.eligible) - Number(left.recommendation.eligible)
    || right.score - left.score
    || left.recommendation.courseCode.localeCompare(right.recommendation.courseCode))
    .slice(0, 5)
    .map((item) => item.recommendation);
}
