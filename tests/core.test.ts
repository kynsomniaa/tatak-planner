import assert from 'node:assert/strict';
import { parseFeuCurriculumHtml } from '../src/parser/feuCurriculumParser';
import { addCourseToPlan, addNextPlannerTerm, addRetakeAttempt, applyMoves, copyCoursesToPlan, coursePoolEligibility, moveCourse, planWarnings, plannerTerms, tatakCourseRecommendations, termGwa, termUnits, validatePlan } from '../src/domain/planner';
import { createWorkspaceFromProgress, createWorkspaceWithAcademicSetup, inferPrerequisiteCodes } from '../src/domain/academicSetup';
import { Curriculum, StudentWorkspace } from '../src/types';
import { generateCourseChains } from '../src/domain/chains';
import { compareCourseCodesForBoard, courseDepartment } from '../src/domain/coursePresentation';
import { applyKnownCurriculumRules, isThesisOrDesignCourse } from '../src/domain/curriculumRules';
import { orderedBoardTerms, reorderBoardColumns, resolveBoardColumnDrop, starterBoardPositions } from '../src/domain/boardLayout';
import { goalSuggestions } from '../src/domain/optimizer';
import { academicTermLabel } from '../src/domain/academicCalendar';
import { migratePlannerWorkspace } from '../src/domain/workspaceMigration';
import { availableCourseCodesForRaid, buildCurriculumGraph, courseField, graphNodesOverlap } from '../src/domain/curriculumGraph';

const rows = Array.from({ length: 10 }, (_, index) => {
  const code = `CPE${String(index + 1).padStart(4, '0')}`;
  const prerequisite = index === 0 ? '' : `CPE${String(index).padStart(4, '0')}`;
  return `<tr><td>${code}</td><td>COURSE ${index + 1}</td><td>3</td><td></td><td>${prerequisite}</td></tr>`;
}).join('');

const html = `<!doctype html>
<!-- saved from url=(0047)https://solar.feutech.edu.ph/program/curriculum -->
<table id="currTable">
  <thead><tr><th>COURSE CODE</th><th>COURSE TITLE</th><th>UNITS</th><th>LABORATORY</th><th>PRE-REQUISITE</th></tr></thead>
  <tbody><tr><td colspan="5">FIRST YEAR ( 1ST TERM )</td></tr>${rows}</tbody>
</table>`;

const parsed = parseFeuCurriculumHtml(html, 'fixture.html', '2026-08-14T00:00:00.000Z');
assert.equal(parsed.curriculum.courses.length, 10, 'parser reads course rows');
assert.equal(parsed.curriculum.terms.length, 1, 'parser reads term divider rows');
assert.deepEqual(parsed.curriculum.courses[1].prerequisites, ['CPE0001']);

assert.throws(
  () => parseFeuCurriculumHtml(html.replace('solar.feutech.edu.ph', 'example.com')),
  /FEU Tech SOLAR/,
  'non-FEU HTML is rejected',
);

const curriculum: Curriculum = {
  id: 'test',
  school: 'FEU Institute of Technology',
  program: 'BS Computer Engineering',
  sourceFileName: 'fixture.html',
  importedAt: '2026-08-14T00:00:00.000Z',
  fingerprint: 'test',
  terms: [
    { id: 'y1t1', label: 'Year 1 · Term 1', year: 1, term: 1, order: 0 },
    { id: 'y1t2', label: 'Year 1 · Term 2', year: 1, term: 2, order: 1 },
    { id: 'y1t3', label: 'Year 1 · Term 3', year: 1, term: 3, order: 2 },
  ],
  courses: [
    {
      code: 'CPE0001', title: 'LECTURE', units: 3, originalTermId: 'y1t1',
      prerequisites: [], corequisites: ['CPE0001L'], linkedLaboratories: ['CPE0001L'],
    },
    {
      code: 'CPE0001L', title: 'LAB', units: 1, originalTermId: 'y1t1',
      prerequisites: [], corequisites: ['CPE0001'], linkedLaboratories: [],
    },
    {
      code: 'CPE0002', title: 'ADVANCED', units: 3, originalTermId: 'y1t2',
      prerequisites: ['CPE0001', 'CPE0001L'], corequisites: [], linkedLaboratories: [],
    },
    {
      code: 'GED0001', title: 'STANDALONE', units: 3, originalTermId: 'y1t1',
      prerequisites: [], corequisites: [], linkedLaboratories: [],
    },
    {
      code: 'GED0002', title: 'FUTURE STANDALONE', units: 3, originalTermId: 'y1t3',
      prerequisites: [], corequisites: [], linkedLaboratories: [],
    },
  ],
};
const workspace: StudentWorkspace = {
  curriculum,
  plan: { CPE0001: 'y1t1', CPE0001L: 'y1t1', CPE0002: 'y1t2', GED0001: 'y1t1' },
  statuses: { CPE0001: 'pending', CPE0001L: 'pending', CPE0002: 'pending', GED0001: 'pending' },
  updatedAt: '2026-08-14T00:00:00.000Z',
};

assert.equal(termUnits(workspace, 'y1t1'), 7, 'column units include lecture, laboratory, and standalone tiles');
assert.equal(termUnits({ ...workspace, statuses: { ...workspace.statuses, CPE0001: 'passed', CPE0001L: 'passed', GED0001: 'passed' } }, 'y1t1'), 7, 'completed columns retain their historical unit total');

assert.equal(validatePlan(workspace).filter((item) => item.blocking).length, 0);
const invalid = moveCourse(workspace, 'CPE0001', 'y1t2');
assert.equal(invalid.ok, false, 'moving a prerequisite beside its dependent is prohibited');

const dependentLater = moveCourse(workspace, 'CPE0002', 'y1t3');
assert.equal(dependentLater.ok, true);
const lectureLater = moveCourse(dependentLater.workspace, 'CPE0001', 'y1t2');
assert.equal(lectureLater.ok, true, 'a valid prerequisite-chain move is allowed');
assert.equal(lectureLater.workspace.plan.CPE0001L, 'y1t2', 'lab pair moves with lecture');

const warnings = planWarnings(lectureLater.workspace);
assert.ok(warnings.some((warning) => warning.type === 'underload'), 'underload remains allowed but warned');

assert.deepEqual(
  new Set(inferPrerequisiteCodes(curriculum, ['CPE0002'])),
  new Set(['CPE0001', 'CPE0001L']),
  'the complete lecture/laboratory prerequisite chain is inferred',
);
const setUp = createWorkspaceWithAcademicSetup(
  curriculum,
  'y1t2',
  ['CPE0002'],
  ['GED0001'],
);
assert.equal(setUp.statuses.CPE0002, 'active', 'current subjects become active');
assert.equal(setUp.statuses.CPE0001, 'passed', 'lecture prerequisite becomes passed');
assert.equal(setUp.statuses.CPE0001L, 'passed', 'laboratory prerequisite becomes passed');
assert.equal(setUp.statuses.GED0001, 'passed', 'standalone subjects are manually confirmed');

const graded: StudentWorkspace = {
  ...workspace,
  grades: { CPE0001: 1.5, CPE0001L: 2 },
};
assert.equal(termGwa(graded, 'y1t1'), 1.625, 'trimester GWA is weighted by course units');

const progressWorkspace = createWorkspaceFromProgress(
  curriculum,
  'y1t2',
  { CPE0001: 'passed', CPE0001L: 'passed', CPE0002: 'active', GED0001: 'pending' },
  {},
);
assert.equal(progressWorkspace.plannedCourseCodes?.includes('GED0002'), false, 'future pending courses start outside the raid plan');
assert.deepEqual(progressWorkspace.plannedCourseCodes, ['CPE0001', 'CPE0001L', 'CPE0002', 'GED0001'], 'Raid 1 stays fixed while passed and active courses remain represented');
assert.deepEqual(progressWorkspace.plannerTermIds, ['y1t1', 'y1t2'], 'raid history runs from the fixed first term through the current term');
assert.equal(progressWorkspace.plan.CPE0002, 'y1t2', 'active courses are placed in the selected current term');
const withNextTerm = addNextPlannerTerm(progressWorkspace);
assert.deepEqual(withNextTerm.plannerTermIds, ['y1t1', 'y1t2', 'y1t3'], 'future raids appear only after New raid is used');
const pooledCourse = addCourseToPlan(withNextTerm, 'GED0002', 'y1t3');
assert.equal(pooledCourse.ok, true, 'an eligible Course Pool subject can be placed into an existing planner term');
assert.equal(pooledCourse.workspace.plan.GED0002, 'y1t3');
assert.equal(academicTermLabel(curriculum.terms[2], { ...progressWorkspace.academicProfile!, startYear: 2024, startTerm: 2 }), 'SY 2025–2026 · Term 1', 'year started and starting trimester drive calendar labels');
const migrated = migratePlannerWorkspace({ ...progressWorkspace, plannerModelVersion: undefined, plannedCourseCodes: curriculum.courses.map((course) => course.code), plannerTermIds: curriculum.terms.map((term) => term.id), retakeAttempts: [{ id: 'test', courseCode: 'CPE0001', termId: 'y1t3', status: 'pending', grades: {}, createdAt: '2026-01-01' }] });
assert.deepEqual(migrated.plannedCourseCodes, ['CPE0001', 'CPE0001L', 'CPE0002', 'GED0001'], 'column-board tests are cleared while fixed Raid 1 and progress are retained');
assert.deepEqual(migrated.plannerTermIds, ['y1t1', 'y1t2']);
const copied = copyCoursesToPlan(progressWorkspace, ['GED0002']);
assert.equal(copied.plannedCourseCodes?.includes('GED0002'), true, 'legacy copied courses remain representable during migration');
const withRetake = addRetakeAttempt(copied, 'CPE0001', 'y1t3');
assert.equal(withRetake.retakeAttempts?.length, 1, 'retakes are separate attempts');
assert.equal(withRetake.plan.CPE0001, 'y1t1', 'retake creation preserves the original attempt term');

const chainCurriculum: Curriculum = { ...curriculum, courses: [...curriculum.courses, { code: 'CPE0003', title: 'FINAL ADVANCED', units: 3, originalTermId: 'y1t3', prerequisites: ['CPE0002'], corequisites: [], linkedLaboratories: [] }] };
const eligibilityWorkspace: StudentWorkspace = {
  ...progressWorkspace,
  curriculum: chainCurriculum,
  statuses: { ...progressWorkspace.statuses, CPE0003: 'pending' },
};
assert.equal(coursePoolEligibility(eligibilityWorkspace, 'CPE0003').available, true, 'an active setup prerequisite unlocks its immediate next course for future planning');
assert.deepEqual(
  coursePoolEligibility({ ...eligibilityWorkspace, statuses: { ...eligibilityWorkspace.statuses, CPE0002: 'pending' } }, 'CPE0003'),
  { available: false, missingPrerequisites: ['CPE0002'] },
  'planned courses alone never unlock later Course Pool subjects',
);
const actualChains = generateCourseChains(chainCurriculum);
assert.equal(actualChains.length, 1, 'chain window uses actual prerequisite roots instead of generated subject categories');
assert.equal(actualChains[0].courseCodes.length, 3, 'only pathways containing at least three combined lecture/lab course tiles are generated');
assert.deepEqual(actualChains[0].edges, [{ sourceCode: 'CPE0001', targetCode: 'CPE0002', kind: 'prerequisite' }, { sourceCode: 'CPE0002', targetCode: 'CPE0003', kind: 'prerequisite' }], 'lecture/lab duplicates fold into one visual prerequisite link');
assert.equal(actualChains[0].kind, 'prerequisite');
assert.equal(courseDepartment('CPE0049'), 'CPE');
assert.equal(courseDepartment('COE0013'), 'COE');
assert.equal(courseDepartment('NSTP1'), 'GED', 'non-CPE/COE curriculum courses remain discoverable in the GED group');
const graph = buildCurriculumGraph(chainCurriculum);
assert.equal(graph.nodes.length, 5, 'every combined lecture/lab tile appears once in the clustered curriculum map');
assert.equal(new Set(graph.nodes.map((node) => node.course.code)).size, graph.nodes.length, 'each course has exactly one home cluster');
assert.equal(courseField(curriculum.courses[0]), 'cpe-core', 'each course derives a portable academic field rather than a fixed visual coordinate');
const firstTermNodes = graph.nodes.filter((node) => node.course.originalTermId === 'y1t1');
const laterNodes = graph.nodes.filter((node) => node.course.originalTermId !== 'y1t1');
assert.ok(Math.max(...firstTermNodes.map((node) => node.x)) < Math.min(...laterNodes.map((node) => node.x)), 'official first-term courses occupy the leftmost starting region');
assert.equal(graphNodesOverlap(graph.nodes), false, 'importance-aware node dimensions never overlap');
const rectanglesOverlap = (left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
graph.fields.forEach((field) => assert.equal(graph.nodes.some((node) => rectanglesOverlap(field.labelBounds, node)), false, `${field.label} receives a course-free map-title slot`));
graph.fields.forEach((field, index) => assert.equal(graph.fields.slice(index + 1).some((other) => rectanglesOverlap(field.labelBounds, other.labelBounds)), false, `${field.label} does not obscure another field title`));
graph.edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
  const source = graph.nodes.find((node) => node.course.code === edge.sourceCode)!;
  const target = graph.nodes.find((node) => node.course.code === edge.targetCode)!;
  assert.ok(source.x + source.width < target.x, `${edge.sourceCode} remains left of ${edge.targetCode}`);
});
const rootNode = graph.nodes.find((node) => node.course.code === 'CPE0001')!;
const standaloneNode = graph.nodes.find((node) => node.course.code === 'GED0002')!;
assert.ok(rootNode.importanceScore > standaloneNode.importanceScore, 'long downstream influence contributes more importance than an isolated course');
assert.equal(availableCourseCodesForRaid(withNextTerm, 'y1t3').has('GED0002'), true, 'the selected raid exposes strictly valid available choices');
const stalePrerequisitePlan: StudentWorkspace = {
  ...withNextTerm,
  curriculum: chainCurriculum,
  plan: { ...withNextTerm.plan, CPE0002: 'y1t2' },
  statuses: { ...withNextTerm.statuses, CPE0002: 'pending', CPE0003: 'pending' },
  plannedCourseCodes: (withNextTerm.plannedCourseCodes ?? []).filter((code) => code !== 'CPE0002'),
};
assert.equal(availableCourseCodesForRaid(stalePrerequisitePlan, 'y1t3').has('CPE0003'), false, 'stale legacy term data cannot unlock a missing prerequisite');

const crossingCurriculum: Curriculum = {
  ...curriculum,
  id: 'alternate-layout',
  courses: [
    { code: 'ALT-A', title: 'PROGRAMMING FOUNDATIONS', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'ALT-B', title: 'ELECTRICAL CIRCUITS', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'ALT-C', title: 'ADVANCED PROGRAMMING', units: 3, originalTermId: 'y1t2', prerequisites: ['ALT-B'], corequisites: [], linkedLaboratories: [] },
    { code: 'ALT-D', title: 'ADVANCED ELECTRONIC CIRCUITS', units: 3, originalTermId: 'y1t2', prerequisites: ['ALT-A'], corequisites: [], linkedLaboratories: [] },
    { code: 'ALT-E', title: 'SYSTEMS INTEGRATION PROJECT', units: 6, originalTermId: 'y1t3', prerequisites: ['ALT-C', 'ALT-D'], corequisites: [], linkedLaboratories: [] },
  ],
};
const crossingGraph = buildCurriculumGraph(crossingCurriculum);
assert.ok(crossingGraph.diagnostics.crossingCountBefore > crossingGraph.diagnostics.crossingCountAfter, 'barycentric sweeps reduce a deterministic reducible crossing');
assert.equal(graphNodesOverlap(crossingGraph.nodes), false, 'an alternate curriculum produces a collision-free map without course-specific coordinates');

const milestoneCurriculum: Curriculum = {
  ...curriculum,
  id: 'milestone-layout',
  courses: [
    { code: 'PATH-A', title: 'ENGINEERING FOUNDATION', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'PATH-B', title: 'COMPUTER ENGINEERING CORE', units: 3, originalTermId: 'y1t2', prerequisites: ['PATH-A'], corequisites: [], linkedLaboratories: [] },
    { code: 'PATH-C', title: 'COMPUTER ENGINEERING THESIS 1', units: 6, originalTermId: 'y1t3', prerequisites: ['PATH-B'], corequisites: [], linkedLaboratories: [] },
    { code: 'PATH-D', title: 'INTERNSHIP 1', units: 6, originalTermId: 'y1t3', prerequisites: ['PATH-B'], corequisites: [], linkedLaboratories: [] },
  ],
};
const milestoneGraph = buildCurriculumGraph(milestoneCurriculum);
const thesisNode = milestoneGraph.nodes.find((node) => node.course.code === 'PATH-C')!;
const internshipNode = milestoneGraph.nodes.find((node) => node.course.code === 'PATH-D')!;
const foundationNode = milestoneGraph.nodes.find((node) => node.course.code === 'PATH-A')!;
assert.equal(thesisNode.milestoneKind, 'thesis', 'thesis metadata creates the dedicated boss-node class');
assert.equal(internshipNode.milestoneKind, 'internship', 'internship metadata creates the distinct final-destination class');
assert.ok(thesisNode.width > internshipNode.width && internshipNode.width > foundationNode.width, 'milestone dimensions preserve a thesis boss and wide internship destination hierarchy');
assert.equal(foundationNode.metrics.distanceToThesis, 2, 'analysis records data-driven distance to thesis');
assert.equal(foundationNode.metrics.distanceToInternship, 2, 'analysis records data-driven distance to internship');
assert.equal(milestoneGraph.edges.find((edge) => edge.targetCode === 'PATH-C')?.branchKind, 'thesis', 'thesis ancestry receives the strongest branch class');
assert.equal(milestoneGraph.edges.find((edge) => edge.targetCode === 'PATH-D')?.branchKind, 'core', 'internship ancestry remains a visually dominant core branch');
assert.equal(graphNodesOverlap(milestoneGraph.nodes), false, 'larger dedicated milestone dimensions remain collision-free');

const cycleCurriculum: Curriculum = {
  ...curriculum,
  id: 'cycle-layout',
  courses: [
    { code: 'CYCLE-A', title: 'COURSE A', units: 3, originalTermId: 'y1t1', prerequisites: ['CYCLE-C'], corequisites: [], linkedLaboratories: [] },
    { code: 'CYCLE-B', title: 'COURSE B', units: 3, originalTermId: 'y1t2', prerequisites: ['CYCLE-A'], corequisites: [], linkedLaboratories: [] },
    { code: 'CYCLE-C', title: 'COURSE C', units: 3, originalTermId: 'y1t3', prerequisites: ['CYCLE-B'], corequisites: [], linkedLaboratories: [] },
  ],
};
const cycleGraph = buildCurriculumGraph(cycleCurriculum);
assert.equal(cycleGraph.nodes.length, 3, 'a cycle does not hang or discard the map');
assert.equal(cycleGraph.diagnostics.cycles.length, 1, 'prerequisite cycles are detected');
assert.match(cycleGraph.validationErrors[0], /Prerequisite cycle detected/);

const withKnownCorequisites = applyKnownCurriculumRules({
  ...curriculum,
  courses: [
    ...curriculum.courses,
    { code: 'COE0001', title: 'ENGINEERING MATHEMATICS 1', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'COE0003', title: 'ENGINEERING MATHEMATICS 2', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
  ],
});
assert.deepEqual(withKnownCorequisites.courses.find((course) => course.code === 'COE0001')?.corequisites, ['COE0003'], 'FEU CpE math corequisite is restored when the export omits it');
assert.deepEqual(withKnownCorequisites.courses.find((course) => course.code === 'COE0003')?.corequisites, ['COE0001'], 'known corequisites are symmetric');

const reorderedColumns = reorderBoardColumns(curriculum.terms, curriculum.terms, [], 'y1t2', -1);
assert.deepEqual(orderedBoardTerms(curriculum.terms, reorderedColumns).map((term) => term.id), ['y1t2', 'y1t1', 'y1t3'], 'legacy visual column order remains readable without changing academic term order');
const starterPositions = starterBoardPositions(curriculum.terms, () => 280);
assert.equal(starterPositions.y1t1.y, starterPositions.y1t3.y, 'starter/reset board keeps the familiar single chronological row');
assert.ok(starterPositions.y1t2.x - starterPositions.y1t1.x >= 320, 'starter board leaves generous space between term columns');
const movedPosition = resolveBoardColumnDrop({
  termId: 'y1t1',
  candidate: { x: 371, y: 249 },
  positions: starterPositions,
  sizes: Object.fromEntries(curriculum.terms.map((term) => [term.id, { width: 280, height: 420 }])),
  snapToGrid: true,
  preventOverlap: true,
});
assert.equal(movedPosition.x % 20, 0, 'free column positions snap to the board grid');
assert.deepEqual(['GED0001', 'COE0001', 'CPE0001'].sort(compareCourseCodesForBoard), ['CPE0001', 'COE0001', 'GED0001'], 'term cards are ordered CPE, COE, then GED');
assert.equal(isThesisOrDesignCourse('CPE PRACTICE AND DESIGN 1', 'BS Computer Engineering'), true, 'CpE Practice and Design is recognized as the official program thesis sequence');
assert.equal(isThesisOrDesignCourse('PRACTICE AND DESIGN 1', 'BS Information Technology'), false, 'program-specific thesis aliases do not leak into other programs');
for (const kind of ['earliest_graduation', 'lighter_workload', 'thesis_readiness'] as const) {
  for (const suggestion of goalSuggestions(workspace, { id: kind, kind, name: kind, notes: kind, allowAiChanges: false })) {
    assert.equal(suggestion.moves.length === 0 || applyMoves(workspace, suggestion.moves).ok, true, `${kind} emits only strictly valid plans`);
  }
}
for (const kind of ['earliest_graduation', 'lighter_workload', 'thesis_readiness'] as const) {
  for (const recommendation of tatakCourseRecommendations(withNextTerm, kind)) {
    assert.equal(addCourseToPlan(withNextTerm, recommendation.courseCode, recommendation.targetTermId).ok, true, `Tatak Plan ${kind} recommends only strictly valid Course Pool placements`);
  }
}

console.log('Core tests passed: parser, weighted skill-tree layout, field affinity, cycle detection, crossing reduction, collision handling, chronological raids, strict availability, prerequisite/corequisite rules, setup progress, migration, units, retakes, GWA, and load warnings.');
