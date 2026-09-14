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
import { academicCalendarPosition, academicTermLabel, currentCurriculumTerm, currentRaidTerm } from '../src/domain/academicCalendar';
import { migratePlannerWorkspace } from '../src/domain/workspaceMigration';
import { availableCourseCodesForRaid, buildCurriculumGraph, courseField, curriculumFieldDefinitions, graphNodesOverlap } from '../src/domain/curriculumGraph';
import { cameraForWorldRect, clampMapCamera, raidLocateZoom } from '../src/domain/mapCamera';
import { courseRatingPreview, starFillFractions } from '../src/domain/ratingPresentation';
import { applyBulkPassedChange, applyProgressStatusChange, applyWorkspaceProgressStatus, courseVisualState, eligibleCourseCodes, getMissingPrerequisites } from '../src/domain/academicProgress';
import { curriculumForProgram, supportedPrograms } from '../src/data/supportedPrograms';
import { findStrategicPath, raidStrategyRecommendations, strategyTargetCodes } from '../src/domain/raidStrategies';

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
assert.equal(courseVisualState(progressWorkspace, 'CPE0002'), 'active', 'ACTIVE has a centralized visual state');
assert.equal(courseVisualState(progressWorkspace, 'GED0001'), 'planned', 'a future or rostered pending course remains PLANNED instead of ACTIVE');
assert.equal(courseVisualState(progressWorkspace, 'GED0002'), 'available', 'an eligible unplanned course is AVAILABLE');
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
assert.equal(curriculumFieldDefinitions.find((field) => field.id === 'programming-software')?.priority, 'cpe-core', 'Programming and Software participates in the technical core through field metadata');
assert.equal(curriculumFieldDefinitions.find((field) => field.id === 'general-communication')?.priority, 'supporting', 'General Education remains a supporting region rather than displacing the CpE core');
assert.ok((curriculumFieldDefinitions.find((field) => field.id === 'math-physics')?.spinePriority ?? 0) > (curriculumFieldDefinitions.find((field) => field.id === 'programming-software')?.spinePriority ?? 0), 'Mathematics and Physics owns the curriculum spine while Programming remains a nearby technical field');
const priorityGraph = buildCurriculumGraph({
  ...curriculum,
  id: 'field-priority-layout',
  courses: [
    { code: 'COE1000', title: 'CALCULUS 1', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'CPE1000', title: 'PROGRAMMING FOUNDATIONS', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'GED1000', title: 'ART APPRECIATION', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
  ],
});
const mathCenter = priorityGraph.fields.find((field) => field.id === 'math-physics')!.centerY;
const programmingCenter = priorityGraph.fields.find((field) => field.id === 'programming-software')!.centerY;
const supportingCenter = priorityGraph.fields.find((field) => field.priority === 'supporting')!.centerY;
assert.ok(programmingCenter < mathCenter && mathCenter < supportingCenter, 'the layout centers Mathematics and Physics between the nearby Programming branch and peripheral supporting fields');
const firstTermNodes = graph.nodes.filter((node) => node.course.originalTermId === 'y1t1');
const laterNodes = graph.nodes.filter((node) => node.course.originalTermId !== 'y1t1');
assert.ok(Math.max(...firstTermNodes.map((node) => node.x)) < Math.min(...laterNodes.map((node) => node.x)), 'official first-term courses occupy the leftmost starting region');
assert.equal(graphNodesOverlap(graph.nodes), false, 'importance-aware node dimensions never overlap');
const rectanglesOverlap = (left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
const connectorCrosses = (edge: { points?: Array<{ x: number; y: number }> }, rect: { x: number; y: number; width: number; height: number }) => (edge.points ?? []).slice(1).some((point, index) => {
  const previous = edge.points?.[index];
  if (!previous) return false;
  return Math.max(previous.x, point.x) >= rect.x - 12
    && Math.min(previous.x, point.x) <= rect.x + rect.width + 12
    && Math.max(previous.y, point.y) >= rect.y - 12
    && Math.min(previous.y, point.y) <= rect.y + rect.height + 12;
});
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
assert.ok(crossingGraph.diagnostics.crossingCountAfter <= crossingGraph.diagnostics.crossingCountBefore, 'barycentric sweeps never increase prerequisite crossings');
assert.equal(graphNodesOverlap(crossingGraph.nodes), false, 'an alternate curriculum produces a collision-free map without course-specific coordinates');

const denseFoundationCurriculum: Curriculum = {
  ...curriculum,
  id: 'dense-foundation-layout',
  courses: [
    { code: 'CPE-ROOT', title: 'ROOT', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    ...Array.from({ length: 5 }, (_, index) => ({ code: `CPE-F${index + 1}`, title: `FOUNDATION ${index + 1}`, units: 3, originalTermId: 'y1t2', prerequisites: ['CPE-ROOT'], corequisites: [], linkedLaboratories: [], courseRole: 'core_gateway' as const, foundationalWeight: 0.9 })),
    ...Array.from({ length: 5 }, (_, index) => ({ code: `CPE-D${index + 1}`, title: `CORE DESCENDANT ${index + 1}`, units: 3, originalTermId: 'y1t3', prerequisites: [`CPE-F${index + 1}`], corequisites: [], linkedLaboratories: [] })),
  ],
};
const denseFoundationGraph = buildCurriculumGraph(denseFoundationCurriculum);
assert.ok(Object.values(denseFoundationGraph.foundationBackbone.rankExpansion).some((value) => value > 0), 'artificial center pressure expands local rank spacing');
assert.equal(graphNodesOverlap(denseFoundationGraph.nodes), false, 'dense foundation placement uses micro-lanes and X staggering without node collisions');
assert.ok(denseFoundationGraph.foundationBackbone.nodeCodes.every((code) => {
  const node = denseFoundationGraph.nodes.find((candidate) => candidate.course.code === code)!;
  return Math.abs(node.y + node.height / 2 - denseFoundationGraph.foundationBackbone.centerY) <= denseFoundationGraph.foundationBackbone.corridorHalfHeight + 180;
}), 'dense foundations expand/stagger before being dumped into the lower periphery');

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
assert.ok(thesisNode.width * thesisNode.height >= 328 * 156 * 1.95, 'the Thesis boss uses roughly twice its previous visual mass in the layout engine');
assert.ok(internshipNode.width * internshipNode.height >= 312 * 134 * 1.95, 'the Internship destination uses roughly twice its previous visual mass in the layout engine');
assert.equal(foundationNode.metrics.distanceToThesis, 2, 'analysis records data-driven distance to thesis');
assert.equal(foundationNode.metrics.distanceToInternship, 2, 'analysis records data-driven distance to internship');
assert.equal(milestoneGraph.edges.find((edge) => edge.targetCode === 'PATH-C')?.branchKind, 'thesis', 'thesis ancestry receives the strongest branch class');
assert.equal(milestoneGraph.edges.find((edge) => edge.targetCode === 'PATH-D')?.branchKind, 'core', 'internship ancestry remains a visually dominant core branch');
assert.equal(graphNodesOverlap(milestoneGraph.nodes), false, 'larger dedicated milestone dimensions remain collision-free');

const focusTarget = { x: 2200, y: 1450, width: 480, height: 228 };
const focusContent = { width: 5200, height: 3800 };
const focusViewport = { width: 1200, height: 700 };
for (const startingZoom of [0.25, 0.35, 0.5, 0.75, 1, 1.25, 1.5]) {
  const focused = cameraForWorldRect(focusTarget, raidLocateZoom(startingZoom), focusContent, focusViewport);
  const screenCenterX = (focusTarget.x + focusTarget.width / 2) * focused.zoom - focused.panX;
  const screenCenterY = (focusTarget.y + focusTarget.height / 2) * focused.zoom - focused.panY;
  assert.equal(screenCenterX, focusViewport.width / 2, `Raid locator centers its course when starting at ${startingZoom * 100}%`);
  assert.equal(screenCenterY, focusViewport.height / 2, `Raid locator centers its course vertically when starting at ${startingZoom * 100}%`);
}
const savedCamera = { zoom: 0.35, panX: 400, panY: 300 };
assert.deepEqual(clampMapCamera(savedCamera, focusContent, focusViewport), savedCamera, 'exiting Raid focus restores the exact valid zoom and pan');
assert.deepEqual(courseRatingPreview({ courseCode: 'CPE0001', difficulty: 4, workload: 3, usefulness: 5, count: 2 }), { average: 4, count: 2 }, 'Raid choices receive a real aggregate for reusable visual stars');
assert.equal(courseRatingPreview({ courseCode: 'CPE0001', difficulty: null, workload: null, usefulness: null, count: 0 }), null, 'unrated courses never receive a fabricated score');
const fractionalStars = starFillFractions(4.2);
assert.deepEqual(fractionalStars.slice(0, 4), [1, 1, 1, 1], 'whole-number portions of an average render as full stars');
assert.ok(Math.abs(fractionalStars[4] - 0.2) < 1e-9, 'decimal averages retain a partial fifth-star fill instead of being rounded into Unicode text');

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

const lockedStatuses = { CPE0001: 'pending', CPE0001L: 'pending', CPE0002: 'pending', GED0001: 'pending', GED0002: 'pending' } as const;
assert.deepEqual(getMissingPrerequisites(curriculum, lockedStatuses, 'CPE0002', 'active'), ['CPE0001'], 'strict validation resolves lecture/lab prerequisites to the visible parent course');
const blockedActive = applyProgressStatusChange(curriculum, lockedStatuses, 'CPE0002', 'active');
assert.equal(blockedActive.ok, false, 'a locked course cannot become ACTIVE');
assert.match(blockedActive.error?.message ?? '', /CPE0001 — LECTURE/, 'the ACTIVE error names the missing prerequisite');
const blockedPassed = applyProgressStatusChange(curriculum, lockedStatuses, 'CPE0002', 'passed');
assert.equal(blockedPassed.ok, false, 'a locked course cannot become PASSED');
assert.match(blockedPassed.error?.message ?? '', /CPE0001 — LECTURE/, 'the PASSED error names the missing prerequisite');
const foundationPassed = applyProgressStatusChange(curriculum, lockedStatuses, 'CPE0001', 'passed');
assert.equal(foundationPassed.ok, true);
assert.equal(foundationPassed.value.CPE0001L, 'passed', 'lecture and laboratory progress remains bundled');
assert.equal(applyProgressStatusChange(curriculum, foundationPassed.value, 'CPE0002', 'active').ok, true, 'completing the prerequisite unlocks the blocked course');
const orderedBulk = applyBulkPassedChange(curriculum, lockedStatuses, ['CPE0002', 'CPE0001']);
assert.equal(orderedBulk.ok, true, 'bulk completion sorts work through prerequisite order instead of trusting click order');
assert.equal(orderedBulk.value.CPE0002, 'passed');
const impossibleBulk = applyBulkPassedChange(curriculum, lockedStatuses, ['CPE0002']);
assert.equal(impossibleBulk.ok, false, 'bulk completion cannot create an impossible prerequisite state');
assert.deepEqual(impossibleBulk.value, lockedStatuses, 'a rejected bulk completion is atomic');

const knownCalendar = currentCurriculumTerm(curriculum, 2025, 1, new Date(2026, 2, 15));
assert.equal(knownCalendar.id, 'y1t3', 'the calculated current curriculum term follows the FEU trimester calendar');
assert.equal(currentRaidTerm(curriculum, { startYear: 2025, startTerm: 1, currentYear: 1, currentTerm: 1, currentTermId: 'y1t1', currentCourseCodes: [], inferredPassedCodes: [], manualPassedCodes: [] }, new Date(2026, 2, 15)).id, 'y1t3', 'Current Raid is recalculated from the first enrollment year rather than stale saved UI state');
const todayPosition = academicCalendarPosition();
const liveCurrentTerm = currentCurriculumTerm(curriculum, todayPosition.academicYear);
const liveWorkspace = createWorkspaceFromProgress(curriculum, 'y1t1', { ...lockedStatuses, CPE0001: 'passed', CPE0001L: 'passed' }, {}, todayPosition.academicYear);
const liveActive = applyWorkspaceProgressStatus(liveWorkspace, 'CPE0002', 'active');
assert.equal(liveActive.ok, true);
assert.equal(liveActive.value.plan.CPE0002, liveCurrentTerm.id, 'Progress places a newly ACTIVE course in the calculated Current Raid');
assert.equal(liveActive.value.academicProfile?.currentTermId, liveCurrentTerm.id, 'Progress refreshes stale current-term profile metadata');

assert.equal(supportedPrograms.length, 1, 'the first release exposes one maintainable built-in program choice');
assert.equal(supportedPrograms[0].code, 'BSCpE');
const realCurriculum = curriculumForProgram('feu-bs-cpe');
assert.ok(realCurriculum, 'the built-in BSCpE curriculum can be selected without an HTML upload');
assert.equal(realCurriculum!.courses.length, 87, 'the maintained snapshot contains every row from the supplied real curriculum');
assert.deepEqual(strategyTargetCodes(realCurriculum!, 'thesis'), ['CPE0057L'], 'the real curriculum targets the terminal CpE thesis course instead of an earlier thesis stage');
assert.deepEqual(strategyTargetCodes(realCurriculum!, 'internship'), ['CPE0069'], 'the real curriculum targets the terminal CpE internship course instead of an earlier internship stage');
const realGraph = buildCurriculumGraph(realCurriculum!);
assert.equal(realGraph.nodes.length, 74, 'the real curriculum combines its lecture/laboratory rows into map tiles');
assert.equal(graphNodesOverlap(realGraph.nodes), false, 'the real BSCpE map has no overlapping emphasized nodes');
for (const code of ['COE0007', 'COE0009', 'COE0011']) {
  const node = realGraph.nodes.find((candidate) => candidate.course.code === code)!;
  assert.ok(node.course.courseRole === 'core_gateway', `${code} is explicit portable gateway metadata`);
  assert.ok(node.metrics.foundationalWeight >= 0.96, `${code} carries high foundation weight`);
  assert.ok(['large', 'major'].includes(node.importance), `${code} is visibly more important than a normal tile`);
}
const calculusNode = realGraph.nodes.find((node) => node.course.code === 'COE0007')!;
const calculusTwoNode = realGraph.nodes.find((node) => node.course.code === 'COE0013')!;
const physicsOneNode = realGraph.nodes.find((node) => node.course.code === 'COE0009')!;
const physicsTwoNode = realGraph.nodes.find((node) => node.course.code === 'COE0015')!;
const engineeringDataNode = realGraph.nodes.find((node) => node.course.code === 'COE0011')!;
assert.deepEqual(new Set(realGraph.foundationBackbone.nodeCodes), new Set(['COE0007', 'COE0009', 'COE0011', 'COE0013', 'COE0015']), 'the real map identifies its entire foundation backbone from course metadata');
for (const node of [calculusNode, calculusTwoNode, physicsOneNode, physicsTwoNode, engineeringDataNode]) {
  const distanceFromCenter = Math.abs(node.y + node.height / 2 - realGraph.foundationBackbone.centerY);
  assert.ok(distanceFromCenter <= realGraph.foundationBackbone.corridorHalfHeight + 80, `${node.course.code} remains in or immediately beside the foundation corridor`);
}
for (const node of [calculusNode, calculusTwoNode, physicsOneNode, physicsTwoNode, engineeringDataNode]) {
  assert.equal(node.course.challenging, true, `${node.course.code} carries reusable challenging-course metadata`);
  assert.equal(node.challenging, true, `${node.course.code} receives the challenging node treatment from metadata`);
}
assert.ok(calculusNode.x + calculusNode.width < calculusTwoNode.x, 'Calculus 1 → Calculus 2 reads left-to-right as a coherent foundation branch');
assert.ok(physicsOneNode.x + physicsOneNode.width < physicsTwoNode.x, 'Physics 1 → Physics 2 reads left-to-right as a coherent foundation branch');
assert.ok(realGraph.edges.some((edge) => edge.sourceCode === 'COE0007' && edge.targetCode === 'COE0013'), 'the Calculus foundation branch follows an actual prerequisite edge');
assert.ok(realGraph.edges.some((edge) => edge.sourceCode === 'COE0009' && edge.targetCode === 'COE0015'), 'the Physics foundation branch follows an actual prerequisite edge');
assert.ok(Object.values(realGraph.foundationBackbone.rankExpansion).some((value) => value > 0), 'a dense real center expands local rank spacing instead of dumping foundations below the map');
for (let left = 0; left < realGraph.foundationBackbone.nodeCodes.length; left += 1) {
  for (let right = left + 1; right < realGraph.foundationBackbone.nodeCodes.length; right += 1) {
    const a = realGraph.nodes.find((node) => node.course.code === realGraph.foundationBackbone.nodeCodes[left])!;
    const b = realGraph.nodes.find((node) => node.course.code === realGraph.foundationBackbone.nodeCodes[right])!;
    const horizontalConflict = a.x < b.x + b.width + 24 && a.x + a.width + 24 > b.x;
    if (horizontalConflict) assert.ok(Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) >= a.height / 2 + b.height / 2 + 46 * 1.35 - 0.01, `${a.course.code} and ${b.course.code} retain foundation clearance`);
  }
}
assert.ok(calculusTwoNode.metrics.foundationInfluence > 0.7, 'foundation influence propagates into downstream prerequisite placement');
assert.ok(calculusNode.width > realGraph.nodes.find((node) => node.course.code === 'GED0007')!.width, 'a foundation gateway is larger than an isolated supporting course');
assert.ok(realGraph.width >= Math.max(...realGraph.nodes.map((node) => node.x + node.width)) + 100, 'Fit Map bounds include the locally expanded backbone');
assert.ok(realGraph.diagnostics.crossingCountAfter <= realGraph.diagnostics.crossingCountBefore, 'foundation placement does not increase connector crossings on the real map');
realGraph.fields.forEach((field) => assert.equal(realGraph.nodes.some((node) => rectanglesOverlap(field.labelBounds, node)), false, `${field.label} title does not overlap a real course tile`));
realGraph.fields.forEach((field, index) => assert.equal(realGraph.fields.slice(index + 1).some((other) => rectanglesOverlap(field.labelBounds, other.labelBounds)), false, `${field.label} title does not overlap another real field title`));
realGraph.fields.forEach((field) => assert.equal(realGraph.edges.some((edge) => (edge.prominence ?? 0) >= 0.55 && connectorCrosses(edge, field.labelBounds)), false, `${field.label} title stays clear of major connectors`));

const strategyWorkspace: StudentWorkspace = {
  curriculum: milestoneCurriculum,
  plan: { 'PATH-A': 'y1t1' },
  statuses: { 'PATH-A': 'passed', 'PATH-B': 'pending', 'PATH-C': 'pending', 'PATH-D': 'pending' },
  plannedCourseCodes: ['PATH-A'],
  plannerTermIds: ['y1t1', 'y1t2'],
  updatedAt: '2026-09-13T00:00:00.000Z',
};
const thesisRecommendations = raidStrategyRecommendations(strategyWorkspace, 'y1t2', 'thesis', []);
const internshipRecommendations = raidStrategyRecommendations(strategyWorkspace, 'y1t2', 'internship', []);
assert.equal(thesisRecommendations[0].courseCode, 'PATH-B', 'Thesis Priority ranks the eligible course that advances the actual thesis ancestry first');
assert.equal(internshipRecommendations[0].courseCode, 'PATH-B', 'Internship Priority ranks the eligible course that advances the actual internship ancestry first');
assert.deepEqual(strategyTargetCodes(milestoneCurriculum, 'thesis'), ['PATH-C']);
assert.deepEqual(strategyTargetCodes(milestoneCurriculum, 'internship'), ['PATH-D']);
assert.deepEqual(thesisRecommendations[0].strategicPath, ['PATH-B', 'PATH-C'], 'a Thesis recommendation carries its exact graph-derived recommendation → milestone path');
assert.deepEqual(internshipRecommendations[0].strategicPath, ['PATH-B', 'PATH-D'], 'an Internship recommendation carries its exact graph-derived recommendation → milestone path');
assert.match(thesisRecommendations[0].pathText ?? '', /PATH-B.*PATH-C/, 'the compact student-facing Thesis chain names real path nodes');
assert.match(thesisRecommendations[0].impact ?? '', /Removes 1 of 1 remaining Thesis bottleneck/, 'the impact statement is calculated from remaining student bottlenecks');
assert.equal(thesisRecommendations[0].relationship, 'direct', 'after the second-level feeder is passed, Thesis Priority advances to the unfinished direct prerequisite');
assert.equal(thesisRecommendations[0].eligible, true, 'the advanced direct prerequisite remains immediately addable when valid');
assert.deepEqual(findStrategicPath(milestoneCurriculum, strategyWorkspace, 'PATH-B', ['PATH-C']), ['PATH-B', 'PATH-C'], 'the exported path finder returns a valid directed curriculum path');
assert.deepEqual(findStrategicPath(milestoneCurriculum, strategyWorkspace, 'PATH-C', ['PATH-C']), ['PATH-C'], 'an immediately eligible milestone remains a valid final recommendation');
const ratedWorkload = Array.from({ length: 3 }, (_, index) => ({ id: `r${index}`, userId: `user-${index}`, courseCode: 'PATH-B', username: `u${index}`, difficulty: 5, workload: 2, usefulness: 4, comment: '', createdAt: '', updatedAt: '', hidden: false, reports: 0, program: 'BS Computer Engineering' }));
const ratedThesisRecommendations = raidStrategyRecommendations(strategyWorkspace, 'y1t2', 'thesis', ratedWorkload);
assert.equal(ratedThesisRecommendations[0].rating?.criterion, 'Difficulty', 'strategic recommendations display the actual planning-relevant rating criterion');
assert.equal(ratedThesisRecommendations[0].rating?.average, 5, 'strategic recommendation ratings are calculated from real community data');
const lighterRecommendations = raidStrategyRecommendations(strategyWorkspace, 'y1t2', 'lighter', ratedWorkload);
assert.deepEqual(lighterRecommendations.map((item) => item.courseCode), ['PATH-B'], 'Lighter Workload only recommends currently eligible courses');
assert.match(lighterRecommendations[0].reason, /from 3 ratings/, 'Lighter Workload uses real community workload when enough ratings exist');
assert.equal(raidStrategyRecommendations({ ...strategyWorkspace, statuses: { ...strategyWorkspace.statuses, 'PATH-B': 'passed' } }, 'y1t2', 'thesis', []).some((item) => item.courseCode === 'PATH-B'), false, 'already-passed courses are never recommended as next courses');

const longPathCurriculum: Curriculum = {
  ...milestoneCurriculum,
  id: 'long-strategy-path',
  courses: [
    { code: 'LONG-A', title: 'FOUNDATION COMPLETE', units: 3, originalTermId: 'y1t1', prerequisites: [], corequisites: [], linkedLaboratories: [] },
    { code: 'LONG-B', title: 'NEXT CORE COURSE', units: 3, originalTermId: 'y1t2', prerequisites: ['LONG-A'], corequisites: [], linkedLaboratories: [], courseRole: 'core_gateway', foundationalWeight: 0.9 },
    { code: 'LONG-C', title: 'IMPORTANT INTERMEDIATE', units: 3, originalTermId: 'y1t3', prerequisites: ['LONG-B'], corequisites: [], linkedLaboratories: [] },
    { code: 'LONG-D', title: 'ADVANCED INTERMEDIATE', units: 3, originalTermId: 'y1t3', prerequisites: ['LONG-C'], corequisites: [], linkedLaboratories: [] },
    { code: 'LONG-E', title: 'DIRECT PROJECT PREREQUISITE', units: 3, originalTermId: 'y1t3', prerequisites: ['LONG-D'], corequisites: [], linkedLaboratories: [] },
    { code: 'LONG-F', title: 'COMPUTER ENGINEERING THESIS', units: 6, originalTermId: 'y1t3', prerequisites: ['LONG-E'], corequisites: [], linkedLaboratories: [], courseRole: 'milestone' },
  ],
};
const longPathWorkspace: StudentWorkspace = {
  ...strategyWorkspace,
  curriculum: longPathCurriculum,
  plan: { 'LONG-A': 'y1t1' },
  statuses: { 'LONG-A': 'passed', 'LONG-B': 'pending', 'LONG-C': 'pending', 'LONG-D': 'pending', 'LONG-E': 'pending', 'LONG-F': 'pending' },
  plannedCourseCodes: ['LONG-A'],
};
const longRecommendations = raidStrategyRecommendations(longPathWorkspace, 'y1t2', 'thesis', []);
const lockedFeederRecommendation = longRecommendations.find((item) => item.courseCode === 'LONG-D')!;
assert.equal(lockedFeederRecommendation.relationship, 'feeder', 'Thesis Priority explicitly prioritizes prerequisites of the direct Thesis prerequisite');
assert.equal(lockedFeederRecommendation.eligible, false, 'a strategically useful but currently locked feeder is not presented as takeable');
assert.deepEqual(lockedFeederRecommendation.missingPrerequisites, ['LONG-C'], 'the locked feeder names its real immediate blocker');
assert.match(lockedFeederRecommendation.availabilityText, /LONG-C — IMPORTANT INTERMEDIATE/, 'the locked explanation includes the blocker course title');
const longNextRecommendation = longRecommendations.find((item) => item.courseCode === 'LONG-B')!;
assert.deepEqual(longNextRecommendation.strategicPath, ['LONG-B', 'LONG-C', 'LONG-D', 'LONG-E', 'LONG-F'], 'Show Path retains every exact edge in a long recommendation chain');
assert.ok(longNextRecommendation.displayPath.includes('…') && longNextRecommendation.displayPath.filter((code) => code !== '…').length <= 4, 'long recommendation cards abbreviate the explanation to at most four visible courses');
const exhaustedFeederWorkspace = { ...longPathWorkspace, statuses: { ...longPathWorkspace.statuses, 'LONG-B': 'passed' as const, 'LONG-C': 'passed' as const, 'LONG-D': 'passed' as const }, plannedCourseCodes: ['LONG-A', 'LONG-B', 'LONG-C', 'LONG-D'] };
const exhaustedFeederRecommendations = raidStrategyRecommendations(exhaustedFeederWorkspace, 'y1t2', 'thesis', []);
assert.equal(exhaustedFeederRecommendations[0].courseCode, 'LONG-E', 'when feeder prerequisites are complete, the strategy advances to the next unfinished direct prerequisite');
assert.equal(exhaustedFeederRecommendations.some((item) => item.courseCode === 'LONG-D'), false, 'completed feeder courses are never recommended for retaking');

const newlyPassedMiddle = applyProgressStatusChange(chainCurriculum, eligibilityWorkspace.statuses, 'CPE0002', 'passed');
assert.equal(newlyPassedMiddle.ok, true, 'an off-term Already Passed action reuses centralized prerequisite validation');
assert.equal(eligibleCourseCodes(chainCurriculum, newlyPassedMiddle.value).includes('CPE0003'), true, 'a valid off-term pass immediately unlocks the next current-course choice');

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

console.log('Core tests passed: parser, foundation-backbone layout, challenging metadata and spacing, visual rating fills, explanation-backed feeder strategies, field affinity, cycle detection, crossing reduction, collision handling, chronological raids, strict availability, prerequisite/corequisite rules, off-term setup progress, migration, units, retakes, GWA, and load warnings.');
