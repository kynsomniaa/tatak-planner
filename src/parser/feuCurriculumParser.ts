import { Course, Curriculum, CurriculumTerm, StudentWorkspace } from '../types';
import { applyKnownCurriculumRules } from '../domain/curriculumRules';

export class CurriculumParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurriculumParseError';
  }
}

export interface ParseResult {
  curriculum: Curriculum;
  warnings: string[];
}

const YEAR_WORDS: Record<string, number> = {
  FIRST: 1,
  SECOND: 2,
  THIRD: 3,
  FOURTH: 4,
  FIFTH: 5,
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

const cellText = (html: string): string =>
  decodeEntities(html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeader = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z]/g, '');

const extractCourseCodes = (value: string): string[] => {
  const matches = value.toUpperCase().match(/\b[A-Z]{2,6}\d{1,4}[A-Z]?\b/g) ?? [];
  return [...new Set(matches)];
};

const parseTerm = (text: string, order: number): CurriculumTerm | null => {
  const normalized = text.toUpperCase().replace(/\s+/g, ' ');
  const yearMatch = normalized.match(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH)\s+YEAR\b/);
  const termMatch = normalized.match(/\b([123])(?:ST|ND|RD|TH)\s+TERM\b/);
  if (!yearMatch || !termMatch) return null;

  const year = YEAR_WORDS[yearMatch[1]];
  const term = Number(termMatch[1]);
  return {
    id: `y${year}t${term}`,
    label: `Year ${year} · Term ${term}`,
    year,
    term,
    order,
  };
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const tableFromPortalExport = (html: string): string => {
  const match = html.match(
    /<table\b[^>]*\bid\s*=\s*["']currTable["'][^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!match) {
    throw new CurriculumParseError(
      'No FEU Tech curriculum table (#currTable) was found in this HTML file.',
    );
  }
  return match[1];
};

export function parseFeuCurriculumHtml(
  html: string,
  sourceFileName = 'Program Curriculum.html',
  importedAt = new Date().toISOString(),
): ParseResult {
  if (!/solar\.feutech\.edu\.ph\/program\/curriculum/i.test(html)) {
    throw new CurriculumParseError(
      'This does not look like an FEU Tech SOLAR Program Curriculum export.',
    );
  }

  const table = tableFromPortalExport(html);
  const headerCells = [
    ...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi),
  ].map((match) => normalizeHeader(cellText(match[1])));

  const column = {
    code: headerCells.indexOf('COURSECODE'),
    title: headerCells.indexOf('COURSETITLE'),
    units: headerCells.indexOf('UNITS'),
    laboratory: headerCells.indexOf('LABORATORY'),
    prerequisite: headerCells.indexOf('PREREQUISITE'),
  };

  if ([column.code, column.title, column.units, column.prerequisite].some((index) => index < 0)) {
    throw new CurriculumParseError(
      'The curriculum table is missing one of the required columns: course code, title, units, or prerequisite.',
    );
  }

  const rowHtml = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (match) => match[1],
  );
  const terms: CurriculumTerm[] = [];
  const courseDrafts: Array<Omit<Course, 'corequisites'>> = [];
  let currentTerm: CurriculumTerm | null = null;

  for (const row of rowHtml) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      cellText(match[1]),
    );
    if (cells.length === 0) continue;

    const possibleTerm = cells.length === 1 ? parseTerm(cells[0], terms.length) : null;
    if (possibleTerm) {
      if (terms.some((term) => term.id === possibleTerm.id)) {
        throw new CurriculumParseError(`Duplicate curriculum section: ${possibleTerm.label}.`);
      }
      terms.push(possibleTerm);
      currentTerm = possibleTerm;
      continue;
    }

    if (cells.length < headerCells.length || !cells[column.code]) continue;
    if (!currentTerm) {
      throw new CurriculumParseError(
        `Course ${cells[column.code]} appears before a year/term heading.`,
      );
    }

    const code = cells[column.code].toUpperCase().trim();
    const units = Number(cells[column.units]);
    if (!/^[A-Z]{2,6}\d{1,4}[A-Z]?$/.test(code)) {
      throw new CurriculumParseError(`Invalid course code in the curriculum table: ${code}.`);
    }
    if (!Number.isFinite(units) || units < 0 || units > 12) {
      throw new CurriculumParseError(`Invalid unit value for ${code}: ${cells[column.units]}.`);
    }

    courseDrafts.push({
      code,
      title: cells[column.title].trim(),
      units,
      originalTermId: currentTerm.id,
      prerequisites: extractCourseCodes(cells[column.prerequisite] ?? ''),
      linkedLaboratories:
        column.laboratory >= 0 ? extractCourseCodes(cells[column.laboratory] ?? '') : [],
      description: 'A course description is not included in the SOLAR curriculum export.',
    });
  }

  if (terms.length === 0 || courseDrafts.length === 0) {
    throw new CurriculumParseError('The FEU Tech curriculum table contains no usable terms or courses.');
  }

  const duplicateCodes = courseDrafts
    .map((course) => course.code)
    .filter((code, index, all) => all.indexOf(code) !== index);
  if (duplicateCodes.length > 0) {
    throw new CurriculumParseError(
      `Duplicate course codes were found: ${[...new Set(duplicateCodes)].join(', ')}.`,
    );
  }

  const courseCodes = new Set(courseDrafts.map((course) => course.code));
  const cpeCourseCount = courseDrafts.filter((course) => course.code.startsWith('CPE')).length;
  if (cpeCourseCount < 10) {
    throw new CurriculumParseError(
      'This first version only accepts the FEU Tech BS Computer Engineering curriculum.',
    );
  }

  const reverseLabLinks = new Map<string, Set<string>>();
  for (const course of courseDrafts) {
    for (const labCode of course.linkedLaboratories) {
      if (!reverseLabLinks.has(labCode)) reverseLabLinks.set(labCode, new Set());
      reverseLabLinks.get(labCode)?.add(course.code);
    }
  }

  const parsedCourses: Course[] = courseDrafts.map((course) => ({
    ...course,
    corequisites: [
      ...new Set([
        ...course.linkedLaboratories,
        ...(reverseLabLinks.get(course.code) ?? new Set<string>()),
      ]),
    ].filter((code) => courseCodes.has(code)),
  }));

  const courses = applyKnownCurriculumRules({
    id: 'parsing',
    program: 'BS Computer Engineering',
    school: 'FEU Institute of Technology',
    sourceFileName,
    importedAt,
    terms,
    courses: parsedCourses,
    fingerprint: 'pending',
  }).courses;

  const referencedCodes = new Set(
    courses.flatMap((course) => [...course.prerequisites, ...course.linkedLaboratories]),
  );
  const missingCodes = [...referencedCodes].filter((code) => !courseCodes.has(code)).sort();
  const warnings = missingCodes.map(
    (code) => `The portal export references ${code}, but that course has no row in the table.`,
  );

  const canonical = courses
    .map((course) =>
      [
        course.code,
        course.title,
        course.units,
        course.originalTermId,
        course.prerequisites.join(','),
        course.corequisites.join(','),
      ].join('|'),
    )
    .join('\n');
  const fingerprint = fnv1a(canonical);

  return {
    curriculum: {
      id: `feutech-cpe-${fingerprint}`,
      program: 'BS Computer Engineering',
      school: 'FEU Institute of Technology',
      sourceFileName,
      importedAt,
      terms,
      courses,
      fingerprint,
    },
    warnings,
  };
}

export function createWorkspaceFromCurriculum(curriculum: Curriculum): StudentWorkspace {
  return {
    plannerModelVersion: 2,
    curriculum,
    plan: Object.fromEntries(
      curriculum.courses.map((course) => [course.code, course.originalTermId]),
    ),
    statuses: Object.fromEntries(
      curriculum.courses.map((course) => [course.code, 'pending' as const]),
    ),
    grades: {},
    plannedCourseCodes: [],
    plannerTermIds: [],
    customPlannerTerms: [],
    retakeAttempts: [],
    preferences: {
      showPrerequisiteConnectors: true,
      cardLabel: 'code',
      theme: 'feu-green',
    },
    updatedAt: new Date().toISOString(),
  };
}
