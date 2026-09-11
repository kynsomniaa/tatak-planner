import { Course, CourseRating, Curriculum, StudentWorkspace } from '../types';
import { courseBundleCodes, laboratoryParentIndex, visibleCurriculumCourses } from './academicSetup';
import { courseDepartment } from './coursePresentation';
import { analyzeCurriculumGraph } from './curriculumGraphAnalysis';
import { calculateCurriculumLayout } from './curriculumGraphLayout';
import { addCourseToPlan } from './planner';

export type CurriculumFieldId =
  | 'math-physics'
  | 'programming-software'
  | 'circuits-electronics'
  | 'cpe-core'
  | 'hardware-embedded'
  | 'networks-systems'
  | 'design-thesis'
  | 'internship'
  | 'professional-engineering'
  | 'general-communication'
  | 'pe-nstp';

export type CourseImportance = 'normal' | 'medium' | 'large' | 'major';
export type CourseMilestoneKind = 'thesis' | 'internship' | null;
export type CurriculumBranchKind = 'minor' | 'normal' | 'core' | 'thesis';

export { countCurriculumEdgeCrossings, graphNodesOverlap } from './curriculumGraphLayout';

export interface CurriculumGraphMetrics {
  directDependents: number;
  downstreamCount: number;
  prerequisiteDepth: number;
  downstreamDepth: number;
  bridgeScore: number;
  milestoneWeight: number;
  isThesisAncestor: boolean;
  distanceToThesis: number | null;
  isInternshipAncestor: boolean;
  distanceToInternship: number | null;
}

export interface CurriculumGraphPoint {
  x: number;
  y: number;
  virtual?: boolean;
}

export interface CurriculumGraphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CurriculumGraphNode {
  course: Course;
  fieldId: CurriculumFieldId;
  importance: CourseImportance;
  milestoneKind: CourseMilestoneKind;
  importanceScore: number;
  metrics: CurriculumGraphMetrics;
  difficult: boolean;
  rank: number;
  layoutRank: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CurriculumFieldDefinition {
  id: CurriculumFieldId;
  label: string;
  description: string;
}

export interface CurriculumGraphField extends CurriculumFieldDefinition {
  centerY: number;
  importance: number;
  bounds: CurriculumGraphRect;
  labelBounds: CurriculumGraphRect;
}

export interface CurriculumGraphEdge {
  key: string;
  sourceCode: string;
  targetCode: string;
  kind: 'prerequisite' | 'corequisite';
  points?: CurriculumGraphPoint[];
  rankSpan?: number;
  prominence?: number;
  branchKind?: CurriculumBranchKind;
}

export interface CurriculumGraphLayout {
  width: number;
  height: number;
  nodes: CurriculumGraphNode[];
  fields: CurriculumGraphField[];
  edges: CurriculumGraphEdge[];
  startingRegion: CurriculumGraphRect;
  validationErrors: string[];
  diagnostics: {
    cycles: string[][];
    crossingCountBefore: number;
    crossingCountAfter: number;
  };
}

export const curriculumFieldDefinitions: CurriculumFieldDefinition[] = [
  { id: 'math-physics', label: 'Mathematics & Physics', description: 'Quantitative foundations and scientific reasoning.' },
  { id: 'programming-software', label: 'Programming & Software', description: 'Programming, algorithms, data, and software systems.' },
  { id: 'circuits-electronics', label: 'Electronics & Circuits', description: 'Electrical circuits and electronic devices.' },
  { id: 'cpe-core', label: 'Computer Engineering Core', description: 'Core CpE knowledge linking software and hardware.' },
  { id: 'hardware-embedded', label: 'Embedded & Microprocessors', description: 'Digital logic, processors, architecture, and control.' },
  { id: 'networks-systems', label: 'Networks & Cybersecurity', description: 'Communications, networks, operating systems, and security.' },
  { id: 'design-thesis', label: 'Capstone & Thesis', description: 'Research, design, and culminating project milestones.' },
  { id: 'internship', label: 'Internship', description: 'Supervised industry immersion and professional practice.' },
  { id: 'professional-engineering', label: 'Professional Engineering', description: 'Management, ethics, safety, and engineering practice.' },
  { id: 'general-communication', label: 'General Education', description: 'Communication, humanities, society, and supporting courses.' },
  { id: 'pe-nstp', label: 'PE & NSTP', description: 'Physical education and civic welfare sequences.' },
];

const matches = (course: Course, expression: RegExp) => expression.test(`${course.code} ${course.title} ${course.description ?? ''}`.toUpperCase());

/** Derives one home field from portable course metadata, never from fixed map coordinates. */
export function courseField(course: Course): CurriculumFieldId {
  if (matches(course, /\bNSTP\b|PHYSICAL EDUCATION|\bP\.E\.?\b|CIVIC WELFARE/)) return 'pe-nstp';
  if (matches(course, /INTERNSHIP|\bOJT\b|ON[- ]THE[- ]JOB/)) return 'internship';
  if (matches(course, /PRACTICE AND DESIGN|THESIS|CAPSTONE|METHODS? OF RESEARCH|DESIGN THINKING|DESIGN PROJECT/)) return 'design-thesis';
  if (matches(course, /PROFESSIONAL|OCCUPATIONAL|TECHNOPRENEUR|ENGINEERING MANAGEMENT|ENGINEERING ECONOMICS|SEMINAR|FIELD TRIP|LAWS AND PROFESSIONAL|AS A DISCIPLINE|ENGINEERING ETHICS/)) return 'professional-engineering';
  if (matches(course, /NETWORK|SECURITY|OPERATING SYSTEM|DATA AND DIGITAL COMMUNICATION|EMERGING TECHNOLOG|CYBER/)) return 'networks-systems';
  if (matches(course, /MICROPROCESSOR|COMPUTER ARCHITECTURE|EMBEDDED|\bHDL\b|DIGITAL SIGNAL|FEEDBACK|MIXED SIGNAL|LOGIC CIRCUIT|COMPUTER HARDWARE|DRAFTING/)) return 'hardware-embedded';
  if (matches(course, /ELECTRICAL CIRCUIT|ELECTRONIC CIRCUIT|ELECTRONICS|ELECTROMAGNET/)) return 'circuits-electronics';
  if (matches(course, /PROGRAMMING|SOFTWARE|DATA STRUCTURE|ALGORITHM|DATABASE|DISCRETE MATHEMATICS|OBJECT.ORIENTED/)) return 'programming-software';
  if (matches(course, /MATHEMATICS|CALCULUS|PHYSIC|CHEMISTRY|DIFFERENTIAL|NUMERICAL METHOD|DATA ANALYSIS|BIOENGINEERING|PROBABILITY|STATISTICS/)) return 'math-physics';
  if (courseDepartment(course.code) === 'CPE') return 'cpe-core';
  return 'general-communication';
}

/** Backward-compatible alias for code that previously called these visual regions clusters. */
export function courseCluster(_curriculum: Curriculum, course: Course): CurriculumFieldId {
  return courseField(course);
}

function buildEdges(curriculum: Curriculum, courses: Course[]): CurriculumGraphEdge[] {
  const visibleCodes = new Set(courses.map((course) => course.code));
  const labParents = laboratoryParentIndex(curriculum);
  const normalize = (code: string) => labParents.get(code) ?? code;
  const edges: CurriculumGraphEdge[] = [];
  const seen = new Set<string>();
  courses.forEach((course) => {
    course.prerequisites.forEach((rawSource) => {
      const sourceCode = normalize(rawSource);
      const key = `prerequisite:${sourceCode}->${course.code}`;
      if (sourceCode !== course.code && visibleCodes.has(sourceCode) && !seen.has(key)) {
        seen.add(key);
        edges.push({ key, sourceCode, targetCode: course.code, kind: 'prerequisite' });
      }
    });
    course.corequisites.forEach((rawTarget) => {
      const targetCode = normalize(rawTarget);
      const pair = [course.code, targetCode].sort();
      const key = `corequisite:${pair.join('<->')}`;
      if (pair[0] !== pair[1] && visibleCodes.has(targetCode) && !seen.has(key)) {
        seen.add(key);
        edges.push({ key, sourceCode: pair[0], targetCode: pair[1], kind: 'corequisite' });
      }
    });
  });
  return edges;
}

export function buildCurriculumGraph(curriculum: Curriculum, ratings: CourseRating[] = []): CurriculumGraphLayout {
  const courses = visibleCurriculumCourses(curriculum);
  const edges = buildEdges(curriculum, courses);
  const fields = new Map(courses.map((course) => [course.code, courseField(course)]));
  const termOrder = new Map(curriculum.terms.map((term) => [term.id, term.order]));
  const firstTermId = [...curriculum.terms].sort((left, right) => left.order - right.order)[0]?.id;
  const analysis = analyzeCurriculumGraph(courses, edges, fields, termOrder);
  const prominentEdges = edges.map((edge) => {
    if (edge.kind === 'corequisite') return { ...edge, prominence: 0.42, branchKind: 'normal' as const };
    const source = analysis.courses.get(edge.sourceCode);
    const target = analysis.courses.get(edge.targetCode);
    if (!source || !target) return edge;
    const thesisStep = (source.metrics.distanceToThesis !== null
      && target.metrics.distanceToThesis !== null
      && source.metrics.distanceToThesis > target.metrics.distanceToThesis)
      || (source.milestoneKind === 'thesis' && target.milestoneKind === 'thesis');
    const internshipStep = (source.metrics.distanceToInternship !== null
      && target.metrics.distanceToInternship !== null
      && source.metrics.distanceToInternship > target.metrics.distanceToInternship)
      || (source.milestoneKind === 'internship' && target.milestoneKind === 'internship');
    const coreFields: CurriculumFieldId[] = ['math-physics', 'programming-software', 'circuits-electronics', 'cpe-core', 'hardware-embedded', 'networks-systems', 'design-thesis'];
    const structural = Math.min(1, Math.max(source.importanceScore, target.importanceScore) * 0.62
      + Math.max(source.metrics.bridgeScore, target.metrics.bridgeScore) * 0.18
      + Math.min(1, source.metrics.downstreamCount / 12) * 0.2);
    if (thesisStep) {
      const targetDistance = target.metrics.distanceToThesis ?? 0;
      const proximity = 1 / (1 + Math.max(0, targetDistance) * 0.22);
      if (targetDistance <= 3 || source.milestoneKind === 'thesis') {
        return { ...edge, branchKind: 'thesis' as const, prominence: Math.min(1, 0.8 + proximity * 0.2) };
      }
      return { ...edge, branchKind: 'core' as const, prominence: Math.max(0.62, 0.52 + proximity * 0.22) };
    }
    if (internshipStep || (coreFields.includes(source.fieldId) && coreFields.includes(target.fieldId) && structural >= 0.44)) {
      return { ...edge, branchKind: 'core' as const, prominence: Math.max(0.62, structural) };
    }
    if (structural < 0.25 || (source.fieldId === 'general-communication' && target.fieldId === 'general-communication')) {
      return { ...edge, branchKind: 'minor' as const, prominence: Math.min(0.28, structural) };
    }
    return { ...edge, branchKind: 'normal' as const, prominence: Math.max(0.34, structural) };
  });
  const layout = calculateCurriculumLayout(analysis, prominentEdges, curriculumFieldDefinitions, termOrder, firstTermId);
  const difficulty = new Map<string, { total: number; count: number }>();
  ratings.filter((rating) => !rating.hidden).forEach((rating) => {
    const current = difficulty.get(rating.courseCode) ?? { total: 0, count: 0 };
    current.total += rating.difficulty;
    current.count += 1;
    difficulty.set(rating.courseCode, current);
  });
  layout.nodes.forEach((node) => {
    const summary = difficulty.get(node.course.code);
    node.difficult = Boolean(summary && summary.count >= 5 && summary.total / summary.count >= 4);
  });
  return {
    ...layout,
    validationErrors: analysis.validationErrors,
    diagnostics: {
      cycles: analysis.cycles,
      crossingCountBefore: layout.crossingCountBefore,
      crossingCountAfter: layout.crossingCountAfter,
    },
  };
}

export function graphPathForCourse(layout: CurriculumGraphLayout, courseCode: string) {
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  layout.edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
    prerequisites.set(edge.targetCode, [...(prerequisites.get(edge.targetCode) ?? []), edge.sourceCode]);
    dependents.set(edge.sourceCode, [...(dependents.get(edge.sourceCode) ?? []), edge.targetCode]);
  });
  const collect = (start: string, adjacency: Map<string, string[]>) => {
    const result = new Set<string>();
    const pending = [...(adjacency.get(start) ?? [])];
    while (pending.length > 0) {
      const code = pending.pop() as string;
      if (result.has(code)) continue;
      result.add(code);
      pending.push(...(adjacency.get(code) ?? []));
    }
    return result;
  };
  const ancestors = collect(courseCode, prerequisites);
  const descendants = collect(courseCode, dependents);
  const courseCodes = new Set([courseCode, ...ancestors, ...descendants]);
  const edgeKeys = new Set(layout.edges.filter((edge) => courseCodes.has(edge.sourceCode) && courseCodes.has(edge.targetCode)).map((edge) => edge.key));
  return {
    courseCodes,
    edgeKeys,
    ancestors,
    descendants,
    directPrerequisites: new Set(prerequisites.get(courseCode) ?? []),
    directDependents: new Set(dependents.get(courseCode) ?? []),
  };
}

export function availableCourseCodesForRaid(workspace: StudentWorkspace, termId: string): Set<string> {
  const curriculum = workspace.curriculum;
  if (!curriculum) return new Set();
  const firstTermId = [...curriculum.terms].sort((left, right) => left.order - right.order)[0]?.id;
  if (termId === firstTermId) return new Set();
  const included = new Set(workspace.plannedCourseCodes ?? []);
  return new Set(visibleCurriculumCourses(curriculum).flatMap((course) => {
    if (included.has(course.code) || courseBundleCodes(curriculum, course.code).some((code) => included.has(code))) return [];
    if (workspace.statuses[course.code] === 'passed' || workspace.statuses[course.code] === 'active') return [];
    return addCourseToPlan(workspace, course.code, termId).ok ? [course.code] : [];
  }));
}
