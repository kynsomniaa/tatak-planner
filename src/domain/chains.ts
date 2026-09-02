import { Curriculum } from '../types';
import { laboratoryParentIndex } from './academicSetup';
import { courseDepartment } from './coursePresentation';
import { isInternshipCourse, isThesisOrDesignCourse } from './curriculumRules';

export interface CourseChainEdge {
  sourceCode: string;
  targetCode: string;
  kind: 'prerequisite' | 'corequisite';
}

export interface CourseChain {
  id: string;
  name: string;
  description: string;
  courseCodes: string[];
  edges: CourseChainEdge[];
  rootCodes: string[];
  terminalCodes: string[];
  kind: 'prerequisite' | 'priority-internship' | 'priority-thesis';
  startYear: number;
  startTerm: number;
  gedHeavy: boolean;
}

const unique = <T,>(values: T[]) => [...new Set(values)];

export const chainEdgeKey = (edge: CourseChainEdge): string =>
  edge.kind === 'corequisite'
    ? `corequisite:${[edge.sourceCode, edge.targetCode].sort().join('<->')}`
    : `prerequisite:${edge.sourceCode}->${edge.targetCode}`;

const titleCase = (value: string) => value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const summarizedSubject = (title: string): string => {
  const cleaned = title
    .replace(/\((?:LEC|LAB)\)/gi, '')
    .replace(/\b(?:FOR CPE|FOR ENGINEERS?)\b/gi, '')
    .replace(/\b[IVX]+\b$/i, '')
    .replace(/\b\d+\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCase(cleaned || title);
};

/** Builds prerequisite paths from imported relationships plus known FEU corequisites. */
export function generateCourseChains(curriculum: Curriculum): CourseChain[] {
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const labParents = laboratoryParentIndex(curriculum);
  const normalize = (code: string) => labParents.get(code) ?? code;
  const visible = curriculum.courses.filter((course) => !labParents.has(course.code));
  const visibleCodes = new Set(visible.map((course) => course.code));
  const termById = new Map(curriculum.terms.map((term) => [term.id, term]));
  const orderOf = (code: string) => termById.get(byCode.get(code)?.originalTermId ?? '')?.order ?? Number.MAX_SAFE_INTEGER;

  const prerequisiteEdges = unique(curriculum.courses.flatMap((course) => {
    const targetCode = normalize(course.code);
    if (!visibleCodes.has(targetCode)) return [];
    return course.prerequisites.flatMap((rawSource) => {
      const sourceCode = normalize(rawSource);
      if (!byCode.has(rawSource) || !visibleCodes.has(sourceCode) || sourceCode === targetCode) return [];
      return [`${sourceCode}->${targetCode}`];
    });
  })).map((key): CourseChainEdge => {
    const [sourceCode, targetCode] = key.split('->');
    return { sourceCode, targetCode, kind: 'prerequisite' };
  });

  const corequisiteEdges = unique(curriculum.courses.flatMap((course) =>
    course.corequisites.flatMap((rawLinked) => {
      const left = normalize(course.code);
      const right = normalize(rawLinked);
      if (!visibleCodes.has(left) || !visibleCodes.has(right) || left === right) return [];
      return [[left, right].sort().join('<->')];
    }),
  )).map((key): CourseChainEdge => {
    const [sourceCode, targetCode] = key.split('<->');
    return { sourceCode, targetCode, kind: 'corequisite' };
  });

  const parent = new Map([...visibleCodes].map((code) => [code, code]));
  const find = (code: string): string => {
    const direct = parent.get(code) ?? code;
    if (direct === code) return direct;
    const root = find(direct);
    parent.set(code, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  corequisiteEdges.forEach((edge) => union(edge.sourceCode, edge.targetCode));

  const members = new Map<string, string[]>();
  visibleCodes.forEach((code) => {
    const root = find(code);
    members.set(root, [...(members.get(root) ?? []), code]);
  });
  const groupOf = (code: string) => find(normalize(code));
  const groupOutgoing = new Map<string, string[]>();
  const groupIncoming = new Map<string, string[]>();
  prerequisiteEdges.forEach((edge) => {
    const source = groupOf(edge.sourceCode);
    const target = groupOf(edge.targetCode);
    if (source === target) return;
    groupOutgoing.set(source, unique([...(groupOutgoing.get(source) ?? []), target]));
    groupIncoming.set(target, unique([...(groupIncoming.get(target) ?? []), source]));
  });

  const sortedCodes = (codes: Iterable<string>) => [...codes].sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));
  const edgesWithin = (codes: Set<string>) => [
    ...prerequisiteEdges.filter((edge) => codes.has(edge.sourceCode) && codes.has(edge.targetCode)),
    ...corequisiteEdges.filter((edge) => codes.has(edge.sourceCode) && codes.has(edge.targetCode)),
  ];

  const finishChain = ({ id, name, kind, codes, terminalCodes, detail }: {
    id: string;
    name: string;
    kind: CourseChain['kind'];
    codes: Set<string>;
    terminalCodes: string[];
    detail: string;
  }): CourseChain => {
    const ordered = sortedCodes(codes);
    const first = termById.get(byCode.get(ordered[0])?.originalTermId ?? '') ?? curriculum.terms[0];
    const roots = ordered.filter((code) =>
      prerequisiteEdges.every((edge) => edge.targetCode !== code || !codes.has(edge.sourceCode)),
    );
    const gedCount = ordered.filter((code) => courseDepartment(code) === 'GED').length;
    return {
      id,
      name,
      description: `Usually starts in Year ${first?.year ?? 1}, Term ${first?.term ?? 1}. ${detail}`,
      courseCodes: ordered,
      edges: edgesWithin(codes),
      rootCodes: roots,
      terminalCodes,
      kind,
      startYear: first?.year ?? 1,
      startTerm: first?.term ?? 1,
      gedHeavy: gedCount > ordered.length / 2,
    };
  };

  const priorityChain = (
    id: string,
    name: string,
    kind: CourseChain['kind'],
    matcher: (title: string) => boolean,
  ): CourseChain | null => {
    const targets = visible.filter((course) => matcher(course.title)).map((course) => course.code);
    if (targets.length === 0) return null;
    const groups = new Set<string>();
    const pending = targets.map(groupOf);
    while (pending.length > 0) {
      const group = pending.pop() as string;
      if (groups.has(group)) continue;
      groups.add(group);
      (groupIncoming.get(group) ?? []).forEach((source) => pending.push(source));
    }
    const codes = new Set([...groups].flatMap((group) => members.get(group) ?? []));
    const targetNames = targets.map((code) => byCode.get(code)?.title ?? code).map(summarizedSubject);
    return finishChain({
      id,
      name,
      kind,
      codes,
      terminalCodes: targets,
      detail: `Shows every prerequisite-of-a-prerequisite leading to ${unique(targetNames).join(' and ')}.`,
    });
  };

  const priority = [
    priorityChain('priority-internship', 'Internship pathway', 'priority-internship', isInternshipCourse),
    priorityChain('priority-thesis', 'Design / Thesis pathway', 'priority-thesis', (title) => isThesisOrDesignCourse(title, curriculum.program)),
  ].filter((chain): chain is CourseChain => Boolean(chain));

  const participantGroups = new Set(prerequisiteEdges.flatMap((edge) => [groupOf(edge.sourceCode), groupOf(edge.targetCode)]));
  const rootGroups = [...participantGroups].filter((group) => (groupIncoming.get(group)?.length ?? 0) === 0);
  const general = rootGroups.map((rootGroup) => {
    const groups = new Set<string>();
    const pending = [rootGroup];
    while (pending.length > 0) {
      const group = pending.shift() as string;
      if (groups.has(group)) continue;
      groups.add(group);
      (groupOutgoing.get(group) ?? []).forEach((target) => pending.push(target));
    }
    const codes = new Set([...groups].flatMap((group) => members.get(group) ?? []));
    const rootCodes = sortedCodes(members.get(rootGroup) ?? []);
    const terminals = sortedCodes(codes).filter((code) =>
      prerequisiteEdges.every((edge) => edge.sourceCode !== code || !codes.has(edge.targetCode)),
    );
    const subject = summarizedSubject(byCode.get(rootCodes[0])?.title ?? rootCodes[0]);
    const terminalNames = unique(terminals.slice(0, 2).map((code) => summarizedSubject(byCode.get(code)?.title ?? code)));
    return finishChain({
      id: `prerequisite-${rootCodes.join('-')}`,
      name: `${subject} pathway`,
      kind: 'prerequisite',
      codes,
      terminalCodes: terminals,
      detail: `Connects ${codes.size} courses${terminalNames.length ? ` and leads toward ${terminalNames.join(' and ')}` : ''}.`,
    });
  }).filter((chain) => chain.edges.some((edge) => edge.kind === 'prerequisite'));

  const seen = new Set<string>();
  return [...priority, ...general]
    .filter((chain) => chain.courseCodes.length >= 3)
    .filter((chain) => {
      const signature = `${chain.kind}:${chain.courseCodes.join('|')}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((a, b) => {
      const priorityRank = (chain: CourseChain) => chain.kind === 'priority-internship' ? 0 : chain.kind === 'priority-thesis' ? 1 : 2;
      return priorityRank(a) - priorityRank(b)
        || Number(a.gedHeavy) - Number(b.gedHeavy)
        || a.startYear - b.startYear
        || a.startTerm - b.startTerm
        || b.edges.length - a.edges.length
        || a.name.localeCompare(b.name);
    });
}
