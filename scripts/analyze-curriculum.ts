import fs from 'node:fs';
import path from 'node:path';
import { parseFeuCurriculumHtml } from '../src/parser/feuCurriculumParser';
import { validatePlan } from '../src/domain/planner';
import { createWorkspaceFromCurriculum } from '../src/parser/feuCurriculumParser';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run analyze -- "C:\\path\\to\\Program Curriculum.html"');
  process.exit(1);
}

const absolute = path.resolve(input);
const html = fs.readFileSync(absolute, 'utf8');
const result = parseFeuCurriculumHtml(html, path.basename(absolute), '2026-08-14T00:00:00.000Z');
const workspace = createWorkspaceFromCurriculum(result.curriculum);
const curriculum = result.curriculum;
const referenced = new Set(curriculum.courses.flatMap((course) => course.prerequisites));
const codes = new Set(curriculum.courses.map((course) => course.code));

console.log(
  JSON.stringify(
    {
      school: curriculum.school,
      program: curriculum.program,
      sourceFile: curriculum.sourceFileName,
      fingerprint: curriculum.fingerprint,
      terms: curriculum.terms.length,
      courses: curriculum.courses.length,
      units: curriculum.courses.reduce((total, course) => total + course.units, 0),
      lectureLabPairs: curriculum.courses.filter((course) => course.linkedLaboratories.length > 0)
        .length,
      prerequisiteReferences: referenced.size,
      missingPrerequisiteRows: [...referenced].filter((code) => !codes.has(code)),
      initialBlockingViolations: validatePlan(workspace).filter((item) => item.blocking).length,
      parserWarnings: result.warnings,
      termSummary: curriculum.terms.map((term) => ({
        term: term.label,
        courses: curriculum.courses.filter((course) => course.originalTermId === term.id).length,
        units: curriculum.courses
          .filter((course) => course.originalTermId === term.id)
          .reduce((total, course) => total + course.units, 0),
      })),
    },
    null,
    2,
  ),
);

