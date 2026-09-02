import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Draggable, Droppable, DropProvider } from 'react-native-reanimated-dnd';
import { colors, contrastText, useAppTheme } from '../theme';
import { BoardColumnPosition, BoardLayoutPreferences, Course, CourseRating, CourseStatus, CurriculumTerm, RetakeAttempt, StudentWorkspace } from '../types';
import {
  addCourseToPlan,
  addNextPlannerTerm,
  addRetakeAttempt,
  dependentCourseCodes,
  moveCourse,
  moveRetakeAttempt,
  planWarnings,
  plannerTerms,
  removeCourseFromPlan,
  removeRetakeAttempt,
  termGwa,
  termUnits,
  updateCourseBundleStatus,
  updateCourseGrade,
  updateRetakeAttempt,
} from '../domain/planner';
import { courseBundleCodes, visibleCurriculumCourses } from '../domain/academicSetup';
import { CourseCard } from './CourseCard';
import { CourseDetailsModal } from './CourseDetailsModal';
import { ratingSummary } from '../services/ratings';
import { BoardWorkspace, defaultBoardLayout } from './BoardWorkspace';
import { DEFAULT_CANVAS_PADDING, DEFAULT_COLUMN_SPACING, orderedBoardTerms, resolveBoardColumnDrop, resolvedBoardPositions } from '../domain/boardLayout';
import { MovableBoardColumn } from './BoardColumnHandle';
import { compareCourseCodesForBoard } from '../domain/coursePresentation';
import { academicTermLabel } from '../domain/academicCalendar';
import { CoursePool, CoursePoolDragData } from './CoursePool';

interface BoardCourseDragData {
  kind: 'course' | 'retake';
  id: string;
  courseCode: string;
}
type CourseDragData = BoardCourseDragData | CoursePoolDragData;

interface SelectedTile {
  course: Course;
  retake?: RetakeAttempt;
  fromPool?: boolean;
  poolLocked?: boolean;
}

interface PlannerBoardTile {
  key: string;
  course: Course;
  retake?: RetakeAttempt;
}

const COMFORTABLE_COLUMN = 292;
const COMPACT_COLUMN = 240;
const COLLAPSED_COLUMN = 96;
const YEAR_BAND_HEIGHT = 34;
const HEADER_HEIGHT = 82;

export function PlannerScreen({ workspace, onChange, ratings, fullScreen, onFullScreenChange }: {
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  ratings: CourseRating[];
  fullScreen: boolean;
  onFullScreenChange: (fullScreen: boolean) => void;
}) {
  const theme = useAppTheme();
  const heroForeground = contrastText(theme.green900);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const mobile = windowWidth < 720;
  const curriculum = workspace.curriculum;
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null);
  const [boardVersion, setBoardVersion] = useState(0);
  if (!curriculum) return null;

  const preferences = workspace.preferences ?? {
    showPrerequisiteConnectors: true,
    cardLabel: 'code' as const,
    theme: 'feu-green' as const,
  };
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const officialVisibleCourses = visibleCurriculumCourses(curriculum);
  const plannedCodes = new Set(workspace.plannedCourseCodes ?? curriculum.courses.map((course) => course.code));
  const visibleBaseCourses = officialVisibleCourses.filter((course) => plannedCodes.has(course.code) && workspace.statuses[course.code] !== 'passed');
  const bundleStatus = (course: Course): CourseStatus => {
    const statuses = courseBundleCodes(curriculum, course.code).map((code) => workspace.statuses[code] ?? 'pending');
    if (statuses.every((status) => status === 'passed')) return 'passed';
    if (statuses.some((status) => status === 'retake')) return 'retake';
    if (statuses.some((status) => status === 'active')) return 'active';
    return 'pending';
  };
  const bundleUnits = (course: Course) => courseBundleCodes(curriculum, course.code)
    .reduce((total, code) => total + (byCode.get(code)?.units ?? 0), 0);
  const completedTermIds = curriculum.terms.filter((term) => {
    const official = officialVisibleCourses.filter((course) => course.originalTermId === term.id);
    return official.length > 0 && official.every((course) => bundleStatus(course) === 'passed');
  }).map((term) => term.id);
  const completedTermSet = new Set(completedTermIds);
  const curriculumYears = [...new Set([...curriculum.terms, ...(workspace.customPlannerTerms ?? [])].map((term) => term.year))];
  const completedYears = curriculumYears.filter((year) => {
    const terms = curriculum.terms.filter((term) => term.year === year);
    return terms.length > 0 && terms.every((term) => completedTermSet.has(term.id));
  });
  const storedLayout = preferences.boardLayouts?.planner;
  const layout: BoardLayoutPreferences = storedLayout ?? defaultBoardLayout(completedTermIds);

  const updateLayout = (next: BoardLayoutPreferences) => onChange({
    ...workspace,
    preferences: { ...preferences, boardLayouts: { ...preferences.boardLayouts, planner: next } },
    updatedAt: new Date().toISOString(),
  });
  const setPreference = (patch: Partial<NonNullable<StudentWorkspace['preferences']>>) => onChange({
    ...workspace,
    preferences: { ...preferences, ...patch },
    updatedAt: new Date().toISOString(),
  });

  const allPlannerTerms = plannerTerms(workspace);
  const termIds = new Set(workspace.plannerTermIds ?? []);
  visibleBaseCourses.forEach((course) => termIds.add(workspace.plan[course.code] ?? course.originalTermId));
  (workspace.retakeAttempts ?? []).forEach((attempt) => termIds.add(attempt.termId));
  if (workspace.academicProfile?.currentTermId) termIds.add(workspace.academicProfile.currentTermId);
  const currentOrder = curriculum.terms.find((term) => term.id === workspace.academicProfile?.currentTermId)?.order ?? 0;
  const hiddenTerms = new Set(layout.hiddenTermIds);
  const displayTerms = orderedBoardTerms(allPlannerTerms, layout.columnOrder ?? []).filter((term) =>
    termIds.has(term.id) &&
    !hiddenTerms.has(term.id) &&
    !(layout.hideCompletedYears && completedYears.includes(term.year)) &&
    !(layout.currentAndFutureOnly && term.order < currentOrder),
  );
  const baseByTerm = new Map(displayTerms.map((term) => [
    term.id,
    visibleBaseCourses.filter((course) => workspace.plan[course.code] === term.id),
  ]));
  const retakesByTerm = new Map(displayTerms.map((term) => [
    term.id,
    (workspace.retakeAttempts ?? []).filter((attempt) => attempt.termId === term.id && attempt.status !== 'passed'),
  ]));
  const curriculumIndex = new Map(officialVisibleCourses.map((course, index) => [course.code, index]));
  const tilesByTerm = new Map(displayTerms.map((term) => {
    const tiles: PlannerBoardTile[] = [
      ...(baseByTerm.get(term.id) ?? []).map((course) => ({ key: `course:${course.code}`, course })),
      ...(retakesByTerm.get(term.id) ?? []).flatMap((retake) => {
        const course = byCode.get(retake.courseCode);
        return course ? [{ key: `retake:${retake.id}`, course, retake }] : [];
      }),
    ];
    tiles.sort((left, right) => compareCourseCodesForBoard(left.course.code, right.course.code)
      || (curriculumIndex.get(left.course.code) ?? 999) - (curriculumIndex.get(right.course.code) ?? 999)
      || Number(Boolean(left.retake)) - Number(Boolean(right.retake)));
    return [term.id, tiles];
  }));
  const collapsedTerms = new Set(layout.collapsedTermIds);
  const columnWidth = (termId: string) => collapsedTerms.has(termId)
    ? COLLAPSED_COLUMN
    : layout.compactCards ? COMPACT_COLUMN : COMFORTABLE_COLUMN;
  const cardStep = layout.compactCards ? 126 : 152;
  const columnHeight = (termId: string) => collapsedTerms.has(termId)
    ? 158
    : Math.max(390, HEADER_HEIGHT + 24 + (tilesByTerm.get(termId)?.length ?? 0) * cardStep);
  const columnSpacing = layout.columnSpacing ?? DEFAULT_COLUMN_SPACING;
  const canvasPadding = layout.canvasPadding ?? DEFAULT_CANVAS_PADDING;
  const positionsById = resolvedBoardPositions(displayTerms, columnWidth, layout.columnPositions, columnSpacing, canvasPadding);
  const xByTerm = new Map(displayTerms.map((term) => [term.id, positionsById[term.id]?.x ?? 0]));
  const yByTerm = new Map(displayTerms.map((term) => [term.id, positionsById[term.id]?.y ?? 0]));
  const columnSizes = Object.fromEntries(displayTerms.map((term) => [term.id, { width: columnWidth(term.id), height: columnHeight(term.id) }]));
  const boardWidth = Math.max(500, ...displayTerms.map((term) => (positionsById[term.id]?.x ?? 0) + columnWidth(term.id) + canvasPadding));
  const boardHeight = Math.max(windowHeight - (fullScreen ? 145 : 215), ...displayTerms.map((term) => (positionsById[term.id]?.y ?? 0) + columnHeight(term.id) + canvasPadding));
  const warnings = planWarnings(workspace);
  const hasCustomPositions = displayTerms.some((term) => Boolean(layout.columnPositions?.[term.id]));
  const yearBands = hasCustomPositions
    ? curriculumYears.flatMap((year) => {
      const terms = displayTerms.filter((term) => term.year === year);
      if (!terms.length) return [];
      return [{ key: `free-${year}`, year, x: Math.min(...terms.map((term) => xByTerm.get(term.id) ?? 0)), top: Math.max(4, Math.min(...terms.map((term) => yByTerm.get(term.id) ?? 0)) - YEAR_BAND_HEIGHT + 4), width: 144, done: completedYears.includes(year) }];
    })
    : displayTerms.reduce<Array<{ key: string; year: number; x: number; top: number; width: number; done: boolean }>>((bands, term) => {
      const x = xByTerm.get(term.id) ?? 0;
      const top = Math.max(4, (yByTerm.get(term.id) ?? YEAR_BAND_HEIGHT) - YEAR_BAND_HEIGHT + 4);
      const width = columnWidth(term.id);
      const previous = bands[bands.length - 1];
      if (previous?.year === term.year) previous.width = x + width - previous.x;
      else bands.push({ key: `${term.year}-${term.id}`, year: term.year, x, top, width, done: completedYears.includes(term.year) });
      return bands;
    }, []);

  const handleDrop = (data: CourseDragData, targetTermId: string) => {
    const result = data.kind === 'pool'
      ? addCourseToPlan(workspace, data.courseCode, targetTermId)
      : data.kind === 'retake'
      ? moveRetakeAttempt(workspace, data.id, targetTermId)
      : moveCourse(workspace, data.courseCode, targetTermId);
    setBoardVersion((value) => value + 1);
    if (!result.ok) {
      Alert.alert(data.kind === 'pool' ? 'Course stayed in the pool' : 'Card returned to its column', result.violations.map((violation) => violation.message).join('\n\n') || 'This placement is not currently valid.');
      return;
    }
    onChange(result.workspace);
  };
  const setLayoutIds = (key: 'collapsedTermIds' | 'hiddenTermIds', termId: string) => {
    const current = new Set(layout[key]);
    current.has(termId) ? current.delete(termId) : current.add(termId);
    updateLayout({ ...layout, [key]: [...current] });
  };
  const moveColumn = (termId: string, candidate: BoardColumnPosition) => {
    const resolved = resolveBoardColumnDrop({
      termId,
      candidate,
      positions: positionsById,
      sizes: columnSizes,
      snapToGrid: layout.snapToGrid ?? true,
      preventOverlap: layout.preventColumnOverlap ?? true,
    });
    updateLayout({ ...layout, columnPositions: { ...(layout.columnPositions ?? {}), [termId]: resolved } });
  };
  const selectedStatus = selectedTile?.retake?.status ?? (selectedTile ? bundleStatus(selectedTile.course) : 'pending');
  const selectedGrades = selectedTile?.retake?.grades ?? workspace.grades ?? {};

  return (
    <DropProvider>
    <View style={[styles.splitPage, { backgroundColor: theme.canvas }]}> 
      <CoursePool dragVersion={boardVersion} workspace={workspace} onChange={onChange} onPickCourse={(course, canPlan) => setSelectedTile({ course, fromPool: true, poolLocked: !canPlan })} />
      <View style={styles.page}>
        <View style={[styles.hero, mobile && styles.heroMobile, { backgroundColor: theme.green900 }]}> 
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: heroForeground }]}>PERSONAL PLAN</Text>
            <Text style={[styles.heroTitle, { color: heroForeground }]}>Build your trimester plan</Text>
          </View>
          <View style={styles.controls}>
            <Pressable onPress={() => onChange(addNextPlannerTerm(workspace))} style={[styles.copyControl, { backgroundColor: theme.gold }]}><Text style={[styles.controlText, { color: contrastText(theme.gold) }]}>＋ New term</Text></Pressable>
            <Pressable onPress={() => setPreference({ cardLabel: preferences.cardLabel === 'code' ? 'title' : 'code' })} style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.controlText, { color: theme.ink }]}>Show {preferences.cardLabel === 'code' ? 'titles' : 'codes'}</Text></Pressable>
            <Pressable onPress={() => onFullScreenChange(!fullScreen)} style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.controlText, { color: theme.ink }]}>{fullScreen ? 'Exit full screen' : 'Full screen'}</Text></Pressable>
          </View>
        </View>
        <Text style={[styles.hint, { backgroundColor: theme.surface, color: theme.muted }]}>Open Course Pool, then drag an available course into a term. Invalid prerequisite or corequisite placements return to the pool with an explanation.</Text>

        <BoardWorkspace
          layout={layout}
          onLayoutChange={updateLayout}
          contentWidth={boardWidth}
          contentHeight={boardHeight}
          completedTermIds={completedTermIds}
          completedYearCount={completedYears.length}
          hiddenColumnCount={layout.hiddenTermIds.length}
        >
          {(panHandlers) => (
              <View style={[styles.boardCanvas, { width: boardWidth, height: boardHeight }]}> 
                <View nativeID="board-pan-surface" style={[styles.panSurface, { cursor: 'grab' } as never]} {...panHandlers} />
                {yearBands.map((band) => { const background = band.done ? theme.green700 : theme.green800; return <View key={band.key} style={[styles.yearBand, { left: band.x, top: band.top, width: band.width, backgroundColor: background }]}><Text style={[styles.yearBandText, { color: contrastText(background) }]}>{band.done ? `✓ YEAR ${band.year} COMPLETE` : `YEAR ${band.year}`}</Text></View>; })}
                {displayTerms.map((term) => {
                  const courses = baseByTerm.get(term.id) ?? [];
                  const retakes = retakesByTerm.get(term.id) ?? [];
                  const tiles = tilesByTerm.get(term.id) ?? [];
                  const warning = warnings.find((item) => item.termId === term.id && (item.type === 'underload' || item.type === 'overload'));
                  const gwa = termGwa(workspace, term.id);
                  const collapsed = collapsedTerms.has(term.id);
                  const done = completedTermSet.has(term.id);
                  const headerBackground = done ? theme.green700 : theme.green900;
                  const headerForeground = contrastText(headerBackground);
                  const headerContent = (
                    <>
                      {layout.showSchoolYear && !collapsed && <Text style={[styles.schoolYear, { color: headerForeground }]}>{academicTermLabel(term, workspace.academicProfile, curriculum.importedAt)}</Text>}
                      <Text numberOfLines={collapsed ? 3 : 1} style={[styles.termName, { color: headerForeground }, collapsed && styles.termNameCollapsed]}>{done ? '✓ ' : ''}Y{term.year} · T{term.term}</Text>
                      {!collapsed && layout.showGwa && <Text style={[styles.gwaText, { color: theme.gold }]}>{gwa === null ? 'GWA —' : `GWA ${gwa.toFixed(2)}`}</Text>}
                      {!collapsed && done && <Text style={[styles.doneLabel, { color: headerForeground }]}>TERM COMPLETE</Text>}
                    </>
                  );
                  return (
                    <MovableBoardColumn
                      key={term.id}
                      termId={term.id}
                      position={positionsById[term.id]}
                      locked={layout.lockColumnPositions ?? false}
                      onMove={moveColumn}
                      style={{ width: columnWidth(term.id), height: columnHeight(term.id) }}
                    >
                    {(moveHandle) => <Droppable<CourseDragData>
                      capacity={200}
                      droppableId={term.id}
                      onDrop={(data) => handleDrop(data, term.id)}
                      activeStyle={[styles.columnActive, { borderColor: theme.green700 }]}
                      style={[styles.column, { backgroundColor: theme.border, borderColor: done ? theme.green700 : theme.border }]}
                    >
                      <View style={[styles.columnHeader, { backgroundColor: headerBackground }]}> 
                        <View style={styles.headerCopy}>{headerContent}</View>
                        <View style={styles.headerActions}>
                          {moveHandle}
                          {!collapsed && layout.showUnits && <View style={[styles.unitsBadge, { backgroundColor: layout.showWarnings && warning ? theme.warning : theme.green800 }]}><Text style={[styles.unitsText, { color: contrastText(layout.showWarnings && warning ? theme.warning : theme.green800) }]}>{termUnits(workspace, term.id)}u</Text></View>}
                          <Pressable onPress={() => setLayoutIds('collapsedTermIds', term.id)} style={[styles.headerButton, { backgroundColor: theme.surface }]}><Text style={[styles.headerButtonText, { color: theme.ink }]}>{collapsed ? '›' : '‹'}</Text></Pressable>
                          {!collapsed && <Pressable onPress={() => setLayoutIds('hiddenTermIds', term.id)} style={[styles.headerButton, { backgroundColor: theme.surface }]}><Text style={[styles.headerButtonText, { color: theme.ink }]}>×</Text></Pressable>}
                        </View>
                      </View>
                      {!collapsed && <View style={styles.cardList}>
                        {tiles.map((tile) => {
                          const { course, retake } = tile;
                          const status = retake?.status ?? bundleStatus(course);
                          const locked = status === 'passed' || status === 'active';
                          const hasOverride = Boolean(workspace.academicProfile?.prerequisiteOverrides?.[course.code]?.length);
                          return (
                            <Draggable<CourseDragData> key={`${tile.key}-${boardVersion}`} data={{ kind: retake ? 'retake' : 'course', id: retake?.id ?? course.code, courseCode: course.code }} draggableId={retake?.id ?? course.code} dragDisabled={locked} collisionAlgorithm="intersect">
                              <CourseCard
                                course={course}
                                status={status}
                                statusLabel={retake ? 'Retake attempt' : hasOverride ? '⚠ Override' : undefined}
                                cardLabel={preferences.cardLabel}
                                combinedUnits={bundleUnits(course)}
                                labCodes={course.linkedLaboratories}
                                compact={layout.compactCards}
                                onPress={() => setSelectedTile({ course, retake })}
                                dragHandle={locked ? undefined : <Draggable.Handle style={styles.dragHandle}><Text style={[styles.dragText, { color: theme.muted }]}>⠿</Text></Draggable.Handle>}
                              />
                            </Draggable>
                          );
                        })}
                        {courses.length === 0 && retakes.length === 0 && <Text style={[styles.emptyColumn, { color: theme.muted }]}>Drop a Course Pool subject here</Text>}
                        <View style={styles.columnPanZone} />
                      </View>}
                      {collapsed && <View style={styles.columnPanZone} />}
                    </Droppable>}
                    </MovableBoardColumn>
                  );
                })}
              </View>
          )}
        </BoardWorkspace>

        <CourseDetailsModal
          course={selectedTile?.course ?? null}
          status={selectedStatus}
          terms={allPlannerTerms.filter((term) => (workspace.plannerTermIds ?? []).includes(term.id)).map((term) => ({ ...term, label: academicTermLabel(term, workspace.academicProfile, curriculum.importedAt) }))}
          currentTermId={selectedTile?.fromPool ? '' : selectedTile?.retake?.termId ?? (selectedTile ? workspace.plan[selectedTile.course.code] : '')}
          visible={Boolean(selectedTile)}
          allowMove={!selectedTile?.poolLocked}
          allowStatusEdit={!selectedTile?.fromPool}
          allowGrades={!selectedTile?.fromPool}
          onClose={() => setSelectedTile(null)}
          onStatusChange={(status) => {
            if (!selectedTile || selectedTile.fromPool) return;
            onChange(selectedTile.retake ? updateRetakeAttempt(workspace, selectedTile.retake.id, { status }) : updateCourseBundleStatus(workspace, selectedTile.course.code, status));
          }}
          gradeEntries={selectedTile ? courseBundleCodes(curriculum, selectedTile.course.code).map((code) => ({ code, title: byCode.get(code)?.title ?? code, units: byCode.get(code)?.units ?? 0, value: selectedGrades[code] })) : []}
          onGradeChange={(code, grade) => {
            if (!selectedTile || selectedTile.fromPool) return;
            onChange(selectedTile.retake ? updateRetakeAttempt(workspace, selectedTile.retake.id, { gradeCode: code, grade }) : updateCourseGrade(workspace, code, grade));
          }}
          onMove={(termId) => {
            if (!selectedTile) return;
            handleDrop({ kind: selectedTile.fromPool ? 'pool' : selectedTile.retake ? 'retake' : 'course', id: selectedTile.retake?.id ?? selectedTile.course.code, courseCode: selectedTile.course.code }, termId);
            setSelectedTile(null);
          }}
          dependentCodes={selectedTile ? dependentCourseCodes(curriculum, selectedTile.course.code) : []}
          ratingSummary={selectedTile ? ratingSummary(selectedTile.course.code, ratings) : null}
          onPlanRetake={!selectedTile?.fromPool && !selectedTile?.retake && selectedTile && (selectedStatus === 'retake' || selectedStatus === 'passed') ? () => {
            const target = workspace.academicProfile?.currentTermId ?? displayTerms[displayTerms.length - 1]?.id;
            if (target) onChange(addRetakeAttempt(workspace, selectedTile.course.code, target));
            setSelectedTile(null);
          } : undefined}
          onRemove={selectedTile?.fromPool ? undefined : selectedTile?.retake ? () => {
            onChange(removeRetakeAttempt(workspace, selectedTile.retake?.id ?? ''));
            setSelectedTile(null);
          } : selectedTile && selectedStatus !== 'passed' && selectedStatus !== 'active' ? () => {
            onChange(removeCourseFromPlan(workspace, selectedTile.course.code));
            setSelectedTile(null);
          } : undefined}
        />
      </View>
    </View>
    </DropProvider>
  );
}

const styles = StyleSheet.create({
  splitPage: { flex: 1, flexDirection: 'row' },
  page: { flex: 1 },
  hero: { minHeight: 86, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroMobile: { paddingLeft: 48 },
  heroCopy: { marginRight: 10 },
  eyebrow: { color: '#9DCDB6', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { marginTop: 4, color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  controls: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  control: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  copyControl: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  controlText: { fontSize: 9, fontWeight: '900' },
  hint: { paddingHorizontal: 18, paddingVertical: 8, fontSize: 10 },
  boardCanvas: { position: 'relative', paddingBottom: 20 },
  panSurface: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  yearBand: { position: 'absolute', height: 27, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  yearBandText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  column: { position: 'relative', width: '100%', height: '100%', borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  columnActive: { borderColor: colors.green700, borderWidth: 3 },
  columnHeader: { height: HEADER_HEIGHT, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1, height: '100%', justifyContent: 'center' },
  schoolYear: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  termName: { marginTop: 4, color: '#AFC0B7', fontSize: 10, fontWeight: '800' },
  termNameCollapsed: { marginTop: 0, textAlign: 'center', lineHeight: 18 },
  gwaText: { marginTop: 3, color: colors.gold, fontSize: 9, fontWeight: '900' },
  doneLabel: { marginTop: 3, color: '#DDF8E8', fontSize: 8, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitsBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  unitsWarning: { backgroundColor: '#654916' },
  unitsText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  headerButton: { width: 25, height: 25, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  cardList: { flex: 1, padding: 11, minHeight: 280 },
  columnPanZone: { flex: 1, minHeight: 72 },
  dragHandle: { marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 2 },
  dragText: { color: '#85918B', fontSize: 21, lineHeight: 21 },
  emptyColumn: { color: '#75817B', textAlign: 'center', paddingVertical: 28, fontSize: 11, fontWeight: '700' },
});
