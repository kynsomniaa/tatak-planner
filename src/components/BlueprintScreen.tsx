import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, contrastText, useAppTheme } from '../theme';
import { BoardColumnPosition, BoardLayoutPreferences, Course, CourseRating, CourseStatus, Curriculum, CurriculumTerm, StudentWorkspace } from '../types';
import { courseBundleCodes, laboratoryParentIndex, visibleCurriculumCourses } from '../domain/academicSetup';
import { dependentCourseCodes } from '../domain/planner';
import { chainEdgeKey, CourseChain } from '../domain/chains';
import { CourseCard } from './CourseCard';
import { CourseDetailsModal } from './CourseDetailsModal';
import { ratingSummary } from '../services/ratings';
import { BoardWorkspace, defaultBoardLayout } from './BoardWorkspace';
import { DEFAULT_CANVAS_PADDING, DEFAULT_COLUMN_SPACING, orderedBoardTerms, resolveBoardColumnDrop, resolvedBoardPositions } from '../domain/boardLayout';
import { BoardConnectorEdge, BoardConnectors } from './BoardConnectors';
import { ChainSidebar } from './ChainSidebar';
import { MovableBoardColumn } from './BoardColumnHandle';
import { compareCourseCodesForBoard, courseDepartment } from '../domain/coursePresentation';
import { academicTermLabel } from '../domain/academicCalendar';

const COMFORTABLE_COLUMN = 286;
const COMPACT_COLUMN = 238;
const COLLAPSED_COLUMN = 96;
const YEAR_BAND_HEIGHT = 34;
const HEADER_HEIGHT = 78;

export function BlueprintScreen({
  workspace,
  onChange,
  ratings,
  onOpenPlanner,
  selectionMode = false,
  onCancelSelection,
  onCopySelected,
}: {
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  ratings: CourseRating[];
  onOpenPlanner: () => void;
  selectionMode?: boolean;
  onCancelSelection?: () => void;
  onCopySelected?: (courseCodes: string[]) => void;
}) {
  const theme = useAppTheme();
  const heroForeground = contrastText(theme.green900);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const mobile = windowWidth < 720;
  const curriculum = workspace.curriculum;
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedChain, setSelectedChain] = useState<CourseChain | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  if (!curriculum) return null;

  const visibleCourses = visibleCurriculumCourses(curriculum);
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const labParents = laboratoryParentIndex(curriculum);
  const planned = new Set(workspace.plannedCourseCodes ?? curriculum.courses.map((course) => course.code));
  const arrowColor = (sourceCode: string) => courseDepartment(sourceCode) === 'CPE'
    ? theme.arrowCpe
    : courseDepartment(sourceCode) === 'COE' ? theme.arrowCoe : theme.arrowGed;
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
    const termCourses = visibleCourses.filter((course) => course.originalTermId === term.id);
    return termCourses.length > 0 && termCourses.every((course) => bundleStatus(course) === 'passed');
  }).map((term) => term.id);
  const completedTermSet = new Set(completedTermIds);
  const years = [...new Set(curriculum.terms.map((term) => term.year))];
  const completedYears = years.filter((year) => {
    const terms = curriculum.terms.filter((term) => term.year === year);
    return terms.length > 0 && terms.every((term) => completedTermSet.has(term.id));
  });
  const storedLayout = workspace.preferences?.boardLayouts?.curriculum;
  const layout: BoardLayoutPreferences = storedLayout ?? defaultBoardLayout(completedTermIds);
  const updateLayout = (next: BoardLayoutPreferences) => onChange({
    ...workspace,
    preferences: {
      showPrerequisiteConnectors: workspace.preferences?.showPrerequisiteConnectors ?? true,
      cardLabel: workspace.preferences?.cardLabel ?? 'code',
      theme: workspace.preferences?.theme ?? 'feu-green',
      boardLayouts: { ...workspace.preferences?.boardLayouts, curriculum: next },
    },
    updatedAt: new Date().toISOString(),
  });

  const hiddenTerms = new Set(layout.hiddenTermIds);
  const currentOrder = curriculum.terms.find((term) => term.id === workspace.academicProfile?.currentTermId)?.order ?? 0;
  const displayTerms = orderedBoardTerms(curriculum.terms, layout.columnOrder ?? []).filter((term) =>
    !hiddenTerms.has(term.id) &&
    !(layout.hideCompletedYears && completedYears.includes(term.year)) &&
    !(layout.currentAndFutureOnly && term.order < currentOrder),
  );
  const collapsedTerms = new Set(layout.collapsedTermIds);
  const columnWidth = (termId: string) => collapsedTerms.has(termId)
    ? COLLAPSED_COLUMN
    : layout.compactCards ? COMPACT_COLUMN : COMFORTABLE_COLUMN;
  const cardStep = layout.compactCards ? 126 : 152;
  const cardCenter = layout.compactCards ? 58 : 71;
  const coursesByTerm = new Map(displayTerms.map((term) => [
    term.id,
    visibleCourses
      .filter((course) => course.originalTermId === term.id)
      .sort((left, right) => compareCourseCodesForBoard(left.code, right.code)),
  ]));
  const columnHeight = (termId: string) => collapsedTerms.has(termId)
    ? 154
    : Math.max(390, HEADER_HEIGHT + 24 + (coursesByTerm.get(termId)?.length ?? 0) * cardStep);
  const columnSpacing = layout.columnSpacing ?? DEFAULT_COLUMN_SPACING;
  const canvasPadding = layout.canvasPadding ?? DEFAULT_CANVAS_PADDING;
  const positionsById = resolvedBoardPositions(displayTerms, columnWidth, layout.columnPositions, columnSpacing, canvasPadding);
  const xByTerm = new Map(displayTerms.map((term) => [term.id, positionsById[term.id]?.x ?? 0]));
  const yByTerm = new Map(displayTerms.map((term) => [term.id, positionsById[term.id]?.y ?? 0]));
  const columnSizes = Object.fromEntries(displayTerms.map((term) => [term.id, { width: columnWidth(term.id), height: columnHeight(term.id) }]));
  const boardWidth = Math.max(500, ...displayTerms.map((term) => (positionsById[term.id]?.x ?? 0) + columnWidth(term.id) + canvasPadding));
  const boardHeight = Math.max(windowHeight - 215, ...displayTerms.map((term) => (positionsById[term.id]?.y ?? 0) + columnHeight(term.id) + canvasPadding));
  const hasCustomPositions = displayTerms.some((term) => Boolean(layout.columnPositions?.[term.id]));
  const yearBands = hasCustomPositions
    ? years.flatMap((year) => {
      const terms = displayTerms.filter((term) => term.year === year);
      if (!terms.length) return [];
      return [{
        key: `free-${year}`,
        year,
        x: Math.min(...terms.map((term) => xByTerm.get(term.id) ?? 0)),
        top: Math.max(4, Math.min(...terms.map((term) => yByTerm.get(term.id) ?? 0)) - YEAR_BAND_HEIGHT + 4),
        width: 144,
        done: completedYears.includes(year),
      }];
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

  const connectorEdges = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; termId: string }>();
    displayTerms.forEach((term) => {
      const courses = coursesByTerm.get(term.id) ?? [];
      const x = xByTerm.get(term.id) ?? 0;
      const columnY = yByTerm.get(term.id) ?? 0;
      courses.forEach((course, row) => {
        const y = collapsedTerms.has(term.id)
          ? columnY + HEADER_HEIGHT / 2
          : columnY + HEADER_HEIGHT + 12 + row * cardStep + cardCenter;
        courseBundleCodes(curriculum, course.code).forEach((code) => positions.set(code, { x, y, termId: term.id }));
      });
    });
    const seen = new Set<string>();
    const prerequisites = visibleCourses.flatMap((targetCourse): BoardConnectorEdge[] => {
      const target = positions.get(targetCourse.code);
      if (!target) return [];
      return targetCourse.prerequisites.flatMap((rawSource) => {
        const sourceCode = labParents.get(rawSource) ?? rawSource;
        const source = positions.get(sourceCode);
        const key = `prerequisite:${sourceCode}->${targetCourse.code}`;
        if (!source || sourceCode === targetCourse.code || seen.has(key)) return [];
        seen.add(key);
        return [{
          key,
          sourceCode,
          targetCode: targetCourse.code,
          x1: source.x + columnWidth(source.termId) - 12,
          y1: source.y,
          x2: target.x + 12,
          y2: target.y,
          passed: workspace.statuses[sourceCode] === 'passed',
          kind: 'prerequisite',
          color: arrowColor(sourceCode),
        }];
      });
    });
    const corequisites = visibleCourses.flatMap((course): BoardConnectorEdge[] => {
      const source = positions.get(course.code);
      if (!source) return [];
      return course.corequisites.flatMap((rawLinked) => {
        const targetCode = labParents.get(rawLinked) ?? rawLinked;
        const target = positions.get(targetCode);
        const pair = [course.code, targetCode].sort();
        const key = `corequisite:${pair.join('<->')}`;
        if (!target || targetCode === course.code || seen.has(key)) return [];
        seen.add(key);
        return [{
          key,
          sourceCode: pair[0],
          targetCode: pair[1],
          x1: source.x + columnWidth(source.termId) - 12,
          y1: source.y,
          x2: target.x + (source.termId === target.termId ? columnWidth(target.termId) - 12 : 12),
          y2: target.y,
          passed: workspace.statuses[course.code] === 'passed' && workspace.statuses[targetCode] === 'passed',
          kind: 'corequisite',
          color: arrowColor(course.code),
        }];
      });
    });
    return [...prerequisites, ...corequisites];
  }, [curriculum, workspace.statuses, displayTerms.map((term) => term.id).join('|'), layout.compactCards, layout.collapsedTermIds.join('|'), JSON.stringify(layout.columnPositions ?? {}), columnSpacing, theme.arrowCpe, theme.arrowCoe, theme.arrowGed]);
  const selectedEdges = new Set(selectedChain?.edges.map(chainEdgeKey) ?? []);
  const activeConnectorEdges = selectedChain ? connectorEdges.filter((edge) => selectedEdges.has(edge.key)) : [];
  const connectorAccent = selectedChain?.kind === 'priority-internship' ? theme.gold : selectedChain?.kind === 'priority-thesis' ? theme.green800 : theme.green700;
  const highlightVariant = selectedChain?.kind === 'priority-internship' ? 'internship' as const : selectedChain?.kind === 'priority-thesis' ? 'thesis' as const : 'standard' as const;
  const highlightedCodes = new Set(selectedChain?.courseCodes ?? []);

  const toggleCodes = (codes: string[]) => {
    const available = codes.filter((code) => !planned.has(code));
    const allSelected = available.length > 0 && available.every((code) => selection.has(code));
    setSelection((current) => {
      const next = new Set(current);
      available.forEach((code) => allSelected ? next.delete(code) : next.add(code));
      return next;
    });
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

  return (
    <View style={[styles.splitPage, { backgroundColor: theme.canvas }]}> 
      <ChainSidebar curriculum={curriculum} selectedChainId={selectedChain?.id ?? null} onSelect={setSelectedChain} />
      <View style={styles.page}>
        <View style={[styles.hero, mobile && styles.heroMobile, { backgroundColor: theme.green900 }]}> 
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: heroForeground }]}>{selectionMode ? 'COPY TO PERSONAL PLAN' : 'OFFICIAL CURRICULUM'}</Text>
            <Text style={[styles.title, { color: heroForeground }]}>{selectionMode ? 'Choose courses to copy' : 'Program Curriculum'}</Text>
            <Text style={[styles.subtitle, { color: heroForeground }]}>{selectionMode ? 'Select individual courses, a whole term, or a complete year. Existing plan items stay disabled.' : 'Your read-only regular schedule. Drag the board, zoom, collapse terms, and explore prerequisite chains.'}</Text>
          </View>
          <ProgressDonut curriculum={curriculum} workspace={workspace} />
          {!selectionMode && <Pressable onPress={onOpenPlanner} style={[styles.planButton, { backgroundColor: theme.gold }]}><Text style={[styles.planButtonText, { color: contrastText(theme.gold) }]}>Open Plan →</Text></Pressable>}
        </View>

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
              {yearBands.map((band) => {
                const yearCodes = visibleCourses.filter((course) => curriculum.terms.find((term) => term.id === course.originalTermId)?.year === band.year).map((course) => course.code);
                const available = yearCodes.filter((code) => !planned.has(code));
                const selected = available.length > 0 && available.every((code) => selection.has(code));
                return (
                  <Pressable
                    key={band.key}
                    disabled={!selectionMode}
                    onPress={() => toggleCodes(yearCodes)}
                    style={[styles.yearBand, { left: band.x, top: band.top, width: band.width, backgroundColor: band.done ? theme.green700 : theme.green800 }, selected && { backgroundColor: theme.gold }]}
                  >
                    <Text style={[styles.yearBandText, { color: contrastText(selected ? theme.gold : band.done ? theme.green700 : theme.green800) }]}>{band.done ? `✓ YEAR ${band.year} COMPLETE` : `${selected ? '✓ ' : ''}YEAR ${band.year}`}</Text>
                  </Pressable>
                );
              })}
              {displayTerms.map((term) => {
                const courses = coursesByTerm.get(term.id) ?? [];
                const width = columnWidth(term.id);
                const collapsed = collapsedTerms.has(term.id);
                const done = completedTermSet.has(term.id);
                const available = courses.filter((course) => !planned.has(course.code));
                const termSelected = available.length > 0 && available.every((course) => selection.has(course.code));
                const headerBackground = termSelected ? theme.gold : done ? theme.green700 : theme.green900;
                const headerForeground = contrastText(headerBackground);
                const headerContent = (
                  <>
                    {layout.showSchoolYear && !collapsed && <Text style={[styles.schoolYear, { color: headerForeground }]}>{academicTermLabel(term, workspace.academicProfile, curriculum.importedAt)}</Text>}
                    <Text numberOfLines={collapsed ? 3 : 1} style={[styles.termName, { color: headerForeground }, collapsed && styles.termNameCollapsed]}>{done ? '✓ ' : ''}Y{term.year} · T{term.term}</Text>
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
                    style={{ width, height: columnHeight(term.id) }}
                  >
                    {(moveHandle) => <View style={[styles.column, { backgroundColor: theme.border, borderColor: done ? theme.green700 : theme.border }]}> 
                    <Pressable onPress={selectionMode ? () => toggleCodes(courses.map((course) => course.code)) : undefined} style={[styles.columnHeader, { backgroundColor: headerBackground }]}> 
                      <View style={styles.headerCopy}>{headerContent}</View>
                      <View style={styles.headerActions}>
                        {moveHandle}
                        {!collapsed && layout.showUnits && <View style={[styles.unitsBadge, { backgroundColor: theme.surface }]}><Text style={[styles.unitsText, { color: theme.ink }]}>{courses.reduce((total, course) => total + bundleUnits(course), 0)}u</Text></View>}
                        <Pressable onPress={() => setLayoutIds('collapsedTermIds', term.id)} style={[styles.headerButton, { backgroundColor: theme.surface }]}><Text style={[styles.headerButtonText, { color: theme.ink }]}>{collapsed ? '›' : '‹'}</Text></Pressable>
                        {!collapsed && <Pressable onPress={() => setLayoutIds('hiddenTermIds', term.id)} style={[styles.headerButton, { backgroundColor: theme.surface }]}><Text style={[styles.headerButtonText, { color: theme.ink }]}>×</Text></Pressable>}
                      </View>
                    </Pressable>
                    {!collapsed && <View style={styles.courseList}>
                      {courses.map((course) => {
                        const alreadyPlanned = planned.has(course.code);
                        return (
                          <CourseCard
                            key={course.code}
                            course={course}
                            status={bundleStatus(course)}
                            statusLabel={selectionMode && alreadyPlanned ? 'Already planned' : undefined}
                            combinedUnits={bundleUnits(course)}
                            labCodes={course.linkedLaboratories}
                            cardLabel={workspace.preferences?.cardLabel ?? 'code'}
                            compact={layout.compactCards}
                            highlighted={highlightedCodes.has(course.code)}
                            highlightVariant={highlightVariant}
                            dimmed={selectedChain !== null && !highlightedCodes.has(course.code)}
                            selected={selection.has(course.code)}
                            disabled={selectionMode && alreadyPlanned}
                            onPress={() => selectionMode ? toggleCodes([course.code]) : setSelectedCourse(course)}
                            onInfoPress={selectionMode ? () => setSelectedCourse(course) : undefined}
                          />
                        );
                      })}
                      <View style={styles.columnPanZone} />
                    </View>}
                    {collapsed && <View style={styles.columnPanZone} />}
                    </View>}
                  </MovableBoardColumn>
                );
              })}
              {selectedChain && workspace.preferences?.showPrerequisiteConnectors !== false && <BoardConnectors edges={activeConnectorEdges} selectedEdgeKeys={selectedEdges} width={boardWidth} height={boardHeight} accent={connectorAccent} muted={theme.muted} />}
            </View>
          )}
        </BoardWorkspace>

        {selectionMode && (
          <View style={[styles.selectionBar, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.green900 }]}> 
            <Text style={[styles.selectionCount, { color: theme.ink }]}>{selection.size} course{selection.size === 1 ? '' : 's'} selected</Text>
            <Pressable onPress={onCancelSelection} style={[styles.cancelButton, { backgroundColor: theme.canvas }]}><Text style={[styles.cancelText, { color: theme.ink }]}>Cancel</Text></Pressable>
            <Pressable disabled={selection.size === 0} onPress={() => onCopySelected?.([...selection])} style={[styles.copyButton, { backgroundColor: theme.gold }, selection.size === 0 && styles.copyDisabled]}><Text style={[styles.copyText, { color: contrastText(theme.gold) }]}>Copy selected</Text></Pressable>
          </View>
        )}

        <CourseDetailsModal
          course={selectedCourse}
          status={selectedCourse ? bundleStatus(selectedCourse) : 'pending'}
          terms={curriculum.terms}
          currentTermId={selectedCourse && planned.has(selectedCourse.code) ? workspace.plan[selectedCourse.code] : ''}
          visible={Boolean(selectedCourse)}
          onClose={() => setSelectedCourse(null)}
          onStatusChange={() => undefined}
          gradeEntries={selectedCourse ? courseBundleCodes(curriculum, selectedCourse.code).map((code) => ({ code, title: byCode.get(code)?.title ?? code, units: byCode.get(code)?.units ?? 0, value: workspace.grades?.[code] })) : []}
          onGradeChange={() => undefined}
          onMove={() => undefined}
          readOnly
          dependentCodes={selectedCourse ? dependentCourseCodes(curriculum, selectedCourse.code) : []}
          ratingSummary={selectedCourse ? ratingSummary(selectedCourse.code, ratings) : null}
        />
      </View>
    </View>
  );
}

function ProgressDonut({ curriculum, workspace }: { curriculum: Curriculum; workspace: StudentWorkspace }) {
  const theme = useAppTheme();
  const total = Math.max(1, curriculum.courses.reduce((sum, course) => sum + course.units, 0));
  const passed = curriculum.courses.reduce((sum, course) => sum + (workspace.statuses[course.code] === 'passed' ? course.units : 0), 0);
  const active = curriculum.courses.reduce((sum, course) => sum + (workspace.statuses[course.code] === 'active' ? course.units : 0), 0);
  const circumference = 2 * Math.PI * 28;
  const passedLength = circumference * passed / total;
  const activeLength = circumference * active / total;
  const percent = Math.round(passed / total * 100);
  return (
    <View style={[styles.donutCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
      <View style={styles.donutGraphic}>
        <Svg width={72} height={72}>
          <Circle cx="36" cy="36" r="28" fill="none" stroke={theme.border} strokeWidth="9" />
          <Circle cx="36" cy="36" r="28" fill="none" stroke={theme.green700} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${passedLength} ${circumference}`} rotation={-90} origin="36,36" />
          <Circle cx="36" cy="36" r="28" fill="none" stroke={theme.gold} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${activeLength} ${circumference}`} strokeDashoffset={-passedLength} rotation={-90} origin="36,36" />
        </Svg>
        <View style={styles.donutCenter}><Text style={[styles.donutPercent, { color: theme.ink }]}>{percent}%</Text></View>
      </View>
      <View><Text style={[styles.donutTitle, { color: theme.ink }]}>Curriculum progress</Text><Text style={[styles.donutMeta, { color: theme.muted }]}>{passed}u passed · {active}u active</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  splitPage: { flex: 1, flexDirection: 'row' },
  page: { flex: 1 },
  hero: { minHeight: 92, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroMobile: { paddingLeft: 48 },
  heroCopy: { flex: 1, paddingRight: 12 },
  donutCard: { marginRight: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  donutGraphic: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutPercent: { fontSize: 12, fontWeight: '900' },
  donutTitle: { fontSize: 10, fontWeight: '900' },
  donutMeta: { marginTop: 3, maxWidth: 110, fontSize: 8, lineHeight: 11, fontWeight: '700' },
  eyebrow: { color: '#9DCDB6', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 4, color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#BBD6C9', fontSize: 10, lineHeight: 15 },
  planButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10 },
  planButtonText: { fontSize: 10, fontWeight: '900' },
  boardCanvas: { position: 'relative', paddingBottom: 20 },
  panSurface: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  yearBand: { position: 'absolute', height: 27, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  yearBandText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  column: { position: 'relative', width: '100%', height: '100%', borderRadius: 15, overflow: 'hidden', borderWidth: 1 },
  columnHeader: { height: HEADER_HEIGHT, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1, height: '100%', justifyContent: 'center' },
  schoolYear: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  termName: { marginTop: 4, color: '#BBD0C5', fontSize: 10, fontWeight: '900' },
  termNameCollapsed: { marginTop: 0, textAlign: 'center', lineHeight: 18 },
  doneLabel: { marginTop: 4, color: '#DDF8E8', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitsBadge: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  unitsText: { fontSize: 8, fontWeight: '900' },
  headerButton: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  courseList: { flex: 1, padding: 11 },
  columnPanZone: { flex: 1, minHeight: 72 },
  selectionBar: { position: 'absolute', left: 14, right: 14, bottom: 12, minHeight: 60, padding: 10, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', shadowOpacity: 0.18, shadowRadius: 14, elevation: 10 },
  selectionCount: { flex: 1, paddingHorizontal: 8, fontSize: 12, fontWeight: '900' },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11 },
  cancelText: { fontSize: 10, fontWeight: '900' },
  copyButton: { marginLeft: 7, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 11 },
  copyText: { fontSize: 10, fontWeight: '900' },
  copyDisabled: { opacity: 0.4 },
});
