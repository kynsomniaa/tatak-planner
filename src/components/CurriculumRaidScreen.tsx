import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Draggable, DraggableState, Droppable, DropProvider } from 'react-native-reanimated-dnd';
import Svg, { Polygon } from 'react-native-svg';
import { Course, CourseRating, CourseStatus, CourseVisualState, CurriculumTerm, StudentWorkspace } from '../types';
import { contrastText, useAppTheme } from '../theme';
import { courseBundleCodes, visibleCurriculumCourses } from '../domain/academicSetup';
import {
  availableCourseCodesForRaid,
  buildCurriculumGraph,
  courseField,
  curriculumFieldDefinitions,
  CurriculumFieldId,
  CurriculumGraphNode,
  graphPathForCourse,
} from '../domain/curriculumGraph';
import {
  addCourseToPlan,
  addNextPlannerTerm,
  dependentCourseCodes,
  planWarnings,
  plannerTerms,
  removeCourseFromPlan,
  termGwa,
  termUnits,
  updateCourseGrade,
} from '../domain/planner';
import { academicTermLabel, currentRaidTerm } from '../domain/academicCalendar';
import { courseDepartment } from '../domain/coursePresentation';
import { MapCameraState, raidLocateZoom } from '../domain/mapCamera';
import { courseRatingPreview } from '../domain/ratingPresentation';
import { ratingSummary } from '../services/ratings';
import { CourseDetailsModal } from './CourseDetailsModal';
import { CurriculumGraphEdges } from './CurriculumGraphEdges';
import { CurriculumMapViewport, MapFocusRequest } from './CurriculumMapViewport';
import { courseVisualState } from '../domain/academicProgress';
import { raidStrategyRecommendations, RaidStrategyKind, RaidStrategyRecommendation, strategyTargetCodes } from '../domain/raidStrategies';
import { StarRating } from './StarRating';

interface RaidCourseDragData {
  kind: 'raid-course';
  courseCode: string;
}

interface RaidFocusMode {
  courseCode: string;
  previousCamera: MapCameraState;
  plannerWasOpen: boolean;
  strategicPath?: string[];
  milestoneCode?: string;
}

const transparent = (hex: string, opacity: number) => /^#[0-9A-F]{6}$/i.test(hex)
  ? `${hex}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`
  : hex;

const challengingPolygon = (width: number, height: number) => [
  [14, 2], [width - 14, 2], [width - 6, 10],
  [width - 6, height / 2 - 12], [width - 1, height / 2], [width - 6, height / 2 + 12],
  [width - 6, height - 10], [width - 14, height - 2],
  [14, height - 2], [6, height - 10],
  [6, height / 2 + 12], [1, height / 2], [6, height / 2 - 12], [6, 10],
].map(([x, y]) => `${x},${y}`).join(' ');

const fieldAccent = (field: CurriculumFieldId, theme: ReturnType<typeof useAppTheme>) => {
  if (field === 'general-communication' || field === 'pe-nstp') return theme.arrowGed;
  if (field === 'math-physics' || field === 'circuits-electronics' || field === 'professional-engineering') return theme.arrowCoe;
  return theme.arrowCpe;
};

export function CurriculumRaidScreen({ workspace, onChange, ratings }: {
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  ratings: CourseRating[];
}) {
  const theme = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const mobile = windowWidth < 820;
  const plannerColumns = mobile ? 1 : windowWidth >= 1540 ? 4 : windowWidth >= 1080 ? 3 : 2;
  const curriculum = workspace.curriculum;
  const [raidOpen, setRaidOpen] = useState(true);
  const [selectedRaidId, setSelectedRaidId] = useState((workspace.plannerTermIds ?? []).at(-1) ?? workspace.academicProfile?.currentTermId ?? '');
  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null);
  const [hoveredCourseCode, setHoveredCourseCode] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [showEveryArrow, setShowEveryArrow] = useState(false);
  const [focus, setFocus] = useState<MapFocusRequest | undefined>();
  const [raidFocus, setRaidFocus] = useState<RaidFocusMode | null>(null);
  const cameraRef = useRef<MapCameraState>({ zoom: mobile ? 0.62 : 0.72, panX: 0, panY: 0 });
  const [dragVersion, setDragVersion] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<RaidStrategyKind | null>(null);
  if (!curriculum) return null;

  const graph = useMemo(() => buildCurriculumGraph(curriculum, ratings), [curriculum, ratings]);
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const visibleCourses = visibleCurriculumCourses(curriculum);
  const plannedCodes = new Set(workspace.plannedCourseCodes ?? []);
  const allTerms = plannerTerms(workspace);
  const raidIds = workspace.plannerTermIds ?? [];
  const raids = allTerms.filter((term) => raidIds.includes(term.id)).sort((left, right) => left.order - right.order);
  const selectedRaid = raids.find((term) => term.id === selectedRaidId) ?? raids.at(-1) ?? raids[0];
  const calculatedCurrentRaid = currentRaidTerm(curriculum, workspace.academicProfile);
  const currentOrder = calculatedCurrentRaid?.order ?? 0;
  const firstTermId = [...curriculum.terms].sort((left, right) => left.order - right.order)[0]?.id;
  const editableRaid = Boolean(selectedRaid && selectedRaid.id !== firstTermId && selectedRaid.order >= currentOrder);
  const availableCodes = selectedRaid && editableRaid ? availableCourseCodesForRaid(workspace, selectedRaid.id) : new Set<string>();
  const selectedCourse = selectedCourseCode ? byCode.get(selectedCourseCode) ?? null : null;
  const inspectedCourseCode = selectedCourseCode ?? hoveredCourseCode;
  const normalPath = inspectedCourseCode ? graphPathForCourse(graph, inspectedCourseCode) : {
    courseCodes: new Set<string>(), edgeKeys: new Set<string>(), ancestors: new Set<string>(), descendants: new Set<string>(), directPrerequisites: new Set<string>(), directDependents: new Set<string>(),
  };
  const strategyRecommendations = useMemo(() => strategy && selectedRaid && editableRaid
    ? raidStrategyRecommendations(workspace, selectedRaid.id, strategy, ratings)
    : [], [workspace, selectedRaid?.id, editableRaid, strategy, ratings]);
  const strategyPath = useMemo(() => {
    const empty = { courseCodes: new Set<string>(), edgeKeys: new Set<string>(), ancestors: new Set<string>(), descendants: new Set<string>(), directPrerequisites: new Set<string>(), directDependents: new Set<string>() };
    if (!strategy) return empty;
    if (strategy === 'lighter') {
      strategyRecommendations.forEach((item) => empty.courseCodes.add(item.courseCode));
      return empty;
    }
    strategyTargetCodes(curriculum, strategy).forEach((targetCode) => {
      const path = graphPathForCourse(graph, targetCode);
      path.courseCodes.forEach((code) => empty.courseCodes.add(code));
      path.edgeKeys.forEach((key) => empty.edgeKeys.add(key));
      path.ancestors.forEach((code) => empty.ancestors.add(code));
      path.descendants.forEach((code) => empty.descendants.add(code));
      path.directPrerequisites.forEach((code) => empty.directPrerequisites.add(code));
      path.directDependents.forEach((code) => empty.directDependents.add(code));
      empty.courseCodes.add(targetCode);
    });
    return empty;
  }, [strategy, graph, curriculum, strategyRecommendations.map((item) => item.courseCode).join('|')]);
  const focusedStrategyPath = useMemo(() => {
    const courseCodes = new Set(raidFocus?.strategicPath ?? []);
    const edgeKeys = new Set<string>();
    const sequence = raidFocus?.strategicPath ?? [];
    for (let index = 1; index < sequence.length; index += 1) {
      graph.edges.filter((edge) => edge.kind === 'prerequisite' && edge.sourceCode === sequence[index - 1] && edge.targetCode === sequence[index])
        .forEach((edge) => edgeKeys.add(edge.key));
    }
    return {
      courseCodes,
      edgeKeys,
      ancestors: new Set<string>(),
      descendants: new Set(sequence.slice(1)),
      directPrerequisites: new Set<string>(),
      directDependents: new Set(sequence.slice(1, 2)),
    };
  }, [raidFocus?.strategicPath?.join('|'), graph]);
  const inspectedPath = raidFocus?.strategicPath?.length ? focusedStrategyPath : strategy ? strategyPath : normalPath;
  const inspectionActive = Boolean(raidFocus?.strategicPath?.length || strategy || inspectedCourseCode);

  useEffect(() => {
    if (!selectedRaid || raidIds.includes(selectedRaidId)) return;
    setSelectedRaidId(raids.at(-1)?.id ?? '');
  }, [raidIds.join('|')]);

  useEffect(() => {
    setFocus({
      token: Date.now(),
      x: graph.startingRegion.x,
      y: graph.startingRegion.y,
      width: graph.startingRegion.width,
      height: graph.startingRegion.height,
      zoom: mobile ? 0.62 : 0.72,
    });
    setRaidFocus(null);
  }, [curriculum.id]);

  const bundleStatus = (course: Course): CourseStatus => {
    const statuses = courseBundleCodes(curriculum, course.code).map((code) => workspace.statuses[code] ?? 'pending');
    if (statuses.every((status) => status === 'passed')) return 'passed';
    if (statuses.some((status) => status === 'active')) return 'active';
    if (statuses.some((status) => status === 'retake')) return 'retake';
    return 'pending';
  };
  const selectMapCourse = (code: string, showDetails = false) => {
    setSelectedCourseCode(code);
    if (showDetails) setDetailsVisible(true);
  };
  const locateCourseFromRaid = (code: string) => {
    const node = graph.nodes.find((candidate) => candidate.course.code === code);
    if (!node) return;
    setSelectedCourseCode(code);
    setRaidFocus((current) => ({
      courseCode: code,
      previousCamera: current?.previousCamera ?? { ...cameraRef.current },
      plannerWasOpen: current?.plannerWasOpen ?? raidOpen,
    }));
    setRaidOpen(true);
    setFocus({
      token: Date.now(),
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      zoom: raidLocateZoom(cameraRef.current.zoom),
    });
  };
  const showRecommendationPath = (recommendation: RaidStrategyRecommendation) => {
    if (recommendation.strategicPath.length === 0) {
      locateCourseFromRaid(recommendation.courseCode);
      return;
    }
    const pathNodes = recommendation.strategicPath.flatMap((code) => {
      const node = graph.nodes.find((candidate) => candidate.course.code === code);
      return node ? [node] : [];
    });
    if (pathNodes.length === 0) return;
    const minX = Math.min(...pathNodes.map((node) => node.x));
    const minY = Math.min(...pathNodes.map((node) => node.y));
    const maxX = Math.max(...pathNodes.map((node) => node.x + node.width));
    const maxY = Math.max(...pathNodes.map((node) => node.y + node.height));
    const pathWidth = Math.max(1, maxX - minX + 180);
    const pathHeight = Math.max(1, maxY - minY + 180);
    const fitZoom = Math.max(0.28, Math.min(0.9, (windowWidth * 0.84) / pathWidth, (Math.max(420, windowWidth * 0.55) * 0.82) / pathHeight));
    setSelectedCourseCode(recommendation.courseCode);
    setHoveredCourseCode(null);
    setRaidFocus({
      courseCode: recommendation.courseCode,
      previousCamera: { ...cameraRef.current },
      plannerWasOpen: raidOpen,
      strategicPath: recommendation.strategicPath,
      milestoneCode: recommendation.milestoneCode,
    });
    setRaidOpen(false);
    setFocus({ token: Date.now(), x: minX - 90, y: minY - 90, width: pathWidth, height: pathHeight, zoom: fitZoom });
  };
  const exitRaidFocus = () => {
    if (!raidFocus) return;
    setFocus({ token: Date.now(), camera: raidFocus.previousCamera });
    setRaidOpen(raidFocus.plannerWasOpen);
    setRaidFocus(null);
  };
  const finishDrag = () => {
    setDraggingId(null);
    setDragVersion((value) => value + 1);
  };
  const addToRaid = (courseCode: string) => {
    if (!selectedRaid || !editableRaid) {
      finishDrag();
      Alert.alert('Raid is locked', selectedRaid?.id === firstTermId ? 'Raid 1 keeps the official first-term roster.' : 'Past raids are preserved as academic history.');
      return;
    }
    const result = addCourseToPlan(workspace, courseCode, selectedRaid.id);
    finishDrag();
    if (!result.ok) {
      Alert.alert('Course returned to the map', result.violations.map((violation) => violation.message).join('\n\n') || 'This course is not valid for the selected raid.');
      return;
    }
    onChange(result.workspace);
  };
  const newRaid = () => {
    const next = addNextPlannerTerm(workspace);
    onChange(next);
    setSelectedRaidId(next.plannerTermIds?.at(-1) ?? selectedRaidId);
    setRaidOpen(true);
  };
  const renameRaid = (termId: string, name: string) => onChange({
    ...workspace,
    raidNames: { ...(workspace.raidNames ?? {}), [termId]: name },
    updatedAt: new Date().toISOString(),
  });
  const selectedSummary = selectedCourse ? ratingSummary(selectedCourse.code, ratings) : null;
  const conqueredCount = visibleCourses.filter((course) => bundleStatus(course) === 'passed').length;
  const progressPercent = Math.round((conqueredCount / Math.max(1, visibleCourses.length)) * 100);

  return (
    <DropProvider>
      <View style={[styles.page, { backgroundColor: theme.canvas }]}>
        <View style={[styles.hero, mobile && styles.heroMobile, { backgroundColor: theme.green900 }]}>
          <View style={styles.heroCopy}><Text style={[styles.eyebrow, { color: theme.gold }]}>DEGREE EXPEDITION</Text><Text style={[styles.title, { color: contrastText(theme.green900) }]}>Curriculum Map</Text><Text style={[styles.subtitle, { color: contrastText(theme.green900) }]}>Explore connected fields, conquer courses, and assemble your next trimester raid.</Text><View style={styles.mapProgressRow}><Text style={[styles.mapProgressLabel, { color: contrastText(theme.green900) }]}>Degree progress · {progressPercent}%</Text><View style={[styles.mapProgressTrack, { backgroundColor: theme.green800 }]}><View style={[styles.mapProgressFill, { width: `${progressPercent}%`, backgroundColor: theme.gold }]} /></View></View></View>
          <View style={styles.heroActions}>
            <Pressable onPress={() => setShowEveryArrow((value) => !value)} style={[styles.heroButton, { backgroundColor: showEveryArrow ? theme.gold : theme.surface, borderColor: theme.border }]}><Text style={[styles.heroButtonText, { color: showEveryArrow ? contrastText(theme.gold) : theme.ink }]}>{showEveryArrow ? 'Every arrow on' : 'Show every arrow'}</Text></Pressable>
            <Pressable onPress={() => raidFocus ? exitRaidFocus() : setRaidOpen(true)} style={[styles.raidButton, { backgroundColor: theme.gold }]}><Text style={[styles.raidButtonText, { color: contrastText(theme.gold) }]}>{raidFocus ? '← Return to Raid Planner' : '⚔ Raid Planner'}</Text></Pressable>
          </View>
        </View>
        <View style={styles.body}>
          <View style={[styles.mapPane, draggingId && styles.mapPaneDragging]}>
            <CurriculumMapViewport contentWidth={graph.width} contentHeight={graph.height} focus={focus} dragging={Boolean(draggingId)} onCameraChange={(camera) => { cameraRef.current = camera; }}>
              {(panHandlers, panning) => (
                <View style={[styles.mapCanvas, { width: graph.width, height: graph.height }]}>
                  <View nativeID="curriculum-map-pan" style={[StyleSheet.absoluteFillObject, { cursor: panning ? 'grabbing' : 'grab' } as never]} {...panHandlers} />
                  <View style={[styles.startingRegion, { left: graph.startingRegion.x, top: graph.startingRegion.y, width: graph.startingRegion.width, height: graph.startingRegion.height, borderColor: transparent(theme.gold, 0.55), backgroundColor: transparent(theme.gold, 0.07), pointerEvents: 'none' }]}><Text style={[styles.startingRegionTitle, { color: theme.gold }]}>START · FIRST YEAR / FIRST TERM</Text></View>
                  {graph.fields.map((field) => {
                    const accent = fieldAccent(field.id, theme);
                    const relevant = !inspectionActive || graph.nodes.some((node) => node.fieldId === field.id && inspectedPath.courseCodes.has(node.course.code));
                    return <React.Fragment key={field.id}><View style={[styles.fieldRegion, { left: field.bounds.x, top: field.bounds.y, width: field.bounds.width, height: field.bounds.height, backgroundColor: transparent(accent, 0.075), opacity: relevant ? 1 : 0.16, pointerEvents: 'none' }]} /><View style={[styles.fieldLabel, { left: field.labelBounds.x, top: field.labelBounds.y, width: field.labelBounds.width, height: field.labelBounds.height, backgroundColor: transparent(accent, 0.09), borderColor: accent, opacity: relevant ? 1 : 0.16, pointerEvents: 'none' }]}><View style={[styles.fieldMarker, { backgroundColor: accent, shadowColor: accent }]} /><View style={styles.fieldLabelCopy}><Text numberOfLines={1} style={[styles.fieldTitle, { color: theme.ink }]}>{field.label.toUpperCase()}</Text><Text numberOfLines={2} style={[styles.fieldDescription, { color: theme.muted }]}>{field.description}</Text></View></View></React.Fragment>;
                  })}
                  <CurriculumGraphEdges layout={graph} highlightedEdgeKeys={inspectedPath.edgeKeys} showEveryArrow={showEveryArrow} />
                  {graph.nodes.map((node) => {
                    const status = bundleStatus(node.course);
                    const visualState = courseVisualState(workspace, node.course.code);
                    const termId = workspace.plan[node.course.code];
                    const inSelectedRaid = termId === selectedRaid?.id && plannedCodes.has(node.course.code);
                    const available = availableCodes.has(node.course.code);
                    const selected = selectedCourseCode === node.course.code;
                    const relation = inspectedCourseCode === node.course.code ? 'selected'
                      : inspectedPath.ancestors.has(node.course.code) ? 'ancestor'
                      : inspectedPath.descendants.has(node.course.code) ? 'descendant'
                      : 'unrelated';
                    return <MapCourseNode
                      key={`${node.course.code}-${dragVersion}`}
                      node={node}
                      status={status}
                      visualState={available && visualState === 'locked' ? 'available' : visualState}
                      available={available}
                      selected={selected}
                      strategicEndpoint={raidFocus?.milestoneCode === node.course.code}
                      pathHighlighted={inspectedPath.courseCodes.has(node.course.code)}
                      relation={relation}
                      directRelation={inspectedPath.directPrerequisites.has(node.course.code) || inspectedPath.directDependents.has(node.course.code)}
                      dimmed={Boolean(inspectionActive && !inspectedPath.courseCodes.has(node.course.code))}
                      inSelectedRaid={inSelectedRaid}
                      planned={plannedCodes.has(node.course.code)}
                      combinedUnits={courseBundleCodes(curriculum, node.course.code).reduce((sum, code) => sum + (byCode.get(code)?.units ?? 0), 0)}
                      dragVersion={dragVersion}
                      onFocus={() => selectMapCourse(node.course.code)}
                      onHoverIn={() => setHoveredCourseCode(node.course.code)}
                      onHoverOut={() => setHoveredCourseCode((current) => current === node.course.code ? null : current)}
                      onDragStart={() => setDraggingId(`map-${node.course.code}`)}
                      onDragState={(state) => { if (state === DraggableState.IDLE || state === DraggableState.DROPPED) setDraggingId(null); }}
                    />;
                  })}
                  <View style={[styles.mapLegend, { left: 80, top: 40, backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <LegendDot color={theme.green700} label="Conquered" />
                    <LegendDot color={theme.active} label="Active now" />
                    <LegendDot color={theme.gold} label="Planned raid" />
                    <LegendDot color={theme.arrowCpe} label="Available" />
                    <LegendDot color={theme.danger} label="Retake" />
                    <LegendDot color={theme.muted} label="Locked" />
                  </View>
                </View>
              )}
            </CurriculumMapViewport>
            {graph.validationErrors.length > 0 && <View style={[styles.graphError, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}><Text style={[styles.graphErrorTitle, { color: theme.danger }]}>Curriculum data needs attention</Text><Text numberOfLines={3} style={[styles.graphErrorText, { color: theme.ink }]}>{graph.validationErrors.join('\n')}</Text></View>}
            {selectedCourse && <View style={[styles.focusCard, { backgroundColor: theme.surface, borderColor: theme.arrowCpe }]}>
              <View style={styles.focusTop}><View><Text style={[styles.focusCode, { color: theme.green700 }]}>{selectedCourse.code}</Text><Text numberOfLines={2} style={[styles.focusTitle, { color: theme.ink }]}>{selectedCourse.title}</Text></View><Pressable onPress={() => raidFocus ? exitRaidFocus() : setSelectedCourseCode(null)}><Text style={[styles.focusClose, { color: theme.muted }]}>×</Text></Pressable></View>
              <Text style={[styles.focusMeta, { color: theme.muted }]}>{courseBundleCodes(curriculum, selectedCourse.code).reduce((sum, code) => sum + (byCode.get(code)?.units ?? 0), 0)} units · {selectedCourse.prerequisites.length ? `Requires ${selectedCourse.prerequisites.join(', ')}` : 'No prerequisites'}</Text>
              <View style={styles.focusActions}>{availableCodes.has(selectedCourse.code) && <Pressable onPress={() => addToRaid(selectedCourse.code)} style={[styles.addButton, { backgroundColor: theme.gold }]}><Text style={[styles.addButtonText, { color: contrastText(theme.gold) }]}>＋ Add to raid</Text></Pressable>}<Pressable onPress={() => setDetailsVisible(true)} style={[styles.detailButton, { backgroundColor: theme.canvas }]}><Text style={[styles.detailButtonText, { color: theme.ink }]}>Course details</Text></Pressable></View>
            </View>}
          </View>

          <RaidPlanner
            open={raidOpen}
            mobile={mobile}
            columns={plannerColumns}
            workspace={workspace}
            raids={raids}
            selectedRaid={selectedRaid}
            availableCodes={availableCodes}
            editable={editableRaid}
            firstTermId={firstTermId}
            visibleCourses={visibleCourses}
            ratings={ratings}
            selectedCourseCode={selectedCourseCode}
            locatingCourseCode={raidFocus?.courseCode ?? null}
            currentRaidId={calculatedCurrentRaid?.id}
            strategy={strategy}
            strategyRecommendations={strategyRecommendations}
            dragVersion={dragVersion}
            draggingId={draggingId}
            onOpenChange={(open) => { setRaidOpen(open); if (!open) setStrategy(null); }}
            onStrategyChange={setStrategy}
            onSelectRaid={setSelectedRaidId}
            onLocateCourse={locateCourseFromRaid}
            onShowRecommendationPath={showRecommendationPath}
            onExitLocate={exitRaidFocus}
            onAdd={addToRaid}
            onRemove={(courseCode) => onChange(removeCourseFromPlan(workspace, courseCode))}
            onNewRaid={newRaid}
            onRename={renameRaid}
            onDragStart={setDraggingId}
            onDragState={(state) => { if (state === DraggableState.IDLE || state === DraggableState.DROPPED) setDraggingId(null); }}
          />
        </View>

        <CourseDetailsModal
          course={selectedCourse}
          status={selectedCourse ? bundleStatus(selectedCourse) : 'pending'}
          terms={raids.map((term) => ({ ...term, label: workspace.raidNames?.[term.id]?.trim() || `Raid ${term.order + 1} · ${academicTermLabel(term, workspace.academicProfile, curriculum.importedAt)}` }))}
          currentTermId={selectedCourse ? workspace.plan[selectedCourse.code] ?? selectedCourse.originalTermId : ''}
          visible={detailsVisible && Boolean(selectedCourse)}
          allowMove={false}
          allowStatusEdit={false}
          allowGrades
          onClose={() => setDetailsVisible(false)}
          onStatusChange={() => undefined}
          gradeEntries={selectedCourse ? courseBundleCodes(curriculum, selectedCourse.code).map((code) => ({ code, title: byCode.get(code)?.title ?? code, units: byCode.get(code)?.units ?? 0, value: workspace.grades?.[code] })) : []}
          onGradeChange={(code, grade) => onChange(updateCourseGrade(workspace, code, grade))}
          onMove={() => undefined}
          dependentCodes={selectedCourse ? dependentCourseCodes(curriculum, selectedCourse.code) : []}
          ratingSummary={selectedSummary}
        />
      </View>
    </DropProvider>
  );
}

function MapCourseNode({ node, status, visualState, available, selected, strategicEndpoint, pathHighlighted, relation, directRelation, dimmed, inSelectedRaid, planned, combinedUnits, dragVersion, onFocus, onHoverIn, onHoverOut, onDragStart, onDragState }: {
  node: CurriculumGraphNode;
  status: CourseStatus;
  visualState: CourseVisualState;
  available: boolean;
  selected: boolean;
  strategicEndpoint: boolean;
  pathHighlighted: boolean;
  relation: 'selected' | 'ancestor' | 'descendant' | 'unrelated';
  directRelation: boolean;
  dimmed: boolean;
  inSelectedRaid: boolean;
  planned: boolean;
  combinedUnits: number;
  dragVersion: number;
  onFocus: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onDragStart: () => void;
  onDragState: (state: DraggableState) => void;
}) {
  const theme = useAppTheme();
  const department = courseDepartment(node.course.code);
  const departmentColor = department === 'CPE' ? theme.arrowCpe : department === 'COE' ? theme.arrowCoe : theme.arrowGed;
  const conquered = visualState === 'passed';
  const active = visualState === 'active';
  const unlocked = visualState === 'available';
  const retake = status === 'retake';
  const background = conquered ? theme.green700 : active ? theme.activeSoft : retake ? theme.dangerSoft : inSelectedRaid ? theme.warningSoft : theme.surface;
  const foreground = conquered ? contrastText(background) : active ? theme.active : theme.ink;
  const relationColor = strategicEndpoint ? theme.gold : relation === 'ancestor' ? theme.arrowCoe : relation === 'descendant' ? theme.arrowCpe : theme.gold;
  const border = selected ? theme.gold : pathHighlighted ? relationColor : conquered ? theme.gold : active ? theme.active : retake ? theme.danger : unlocked ? theme.arrowCpe : planned ? theme.gold : node.difficult ? theme.arrowCoe : departmentColor;
  const label = conquered ? '✓ CONQUERED' : active ? '⚔ ACTIVE RAID' : retake ? '↻ RETAKE NEEDED' : inSelectedRaid ? 'IN THIS RAID' : planned ? 'PLANNED' : unlocked ? '✦ AVAILABLE' : 'LOCKED';
  const relationLabel = relation === 'ancestor' ? (directRelation ? 'DIRECT PREREQUISITE' : 'PREREQUISITE PATH') : relation === 'descendant' ? (directRelation ? 'DIRECTLY UNLOCKS' : 'DEPENDENT PATH') : null;
  const thesis = node.milestoneKind === 'thesis';
  const internship = node.milestoneKind === 'internship';
  const challenging = node.challenging;
  const gateway = node.course.courseRole === 'core_gateway';
  const milestoneDesignation = thesis ? 'THESIS · BOSS ENCOUNTER' : internship ? 'INTERNSHIP · FINAL DESTINATION' : null;
  const roleLabel = challenging && gateway
    ? 'CHALLENGING · FOUNDATION'
    : challenging
      ? 'CHALLENGING'
      : gateway
        ? 'FOUNDATION GATEWAY'
        : node.importance === 'major' && !milestoneDesignation
          ? 'MILESTONE'
          : null;
  const auraColor = thesis ? theme.arrowCpe : theme.gold;
  const bossShape = Platform.OS === 'web' && thesis ? { clipPath: 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)' } as never : undefined;
  const destinationShape = Platform.OS === 'web' && internship ? { clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 50%, calc(100% - 30px) 100%, 0 100%, 14px 50%)' } as never : undefined;
  const thesisGlow = thesis ? (Platform.OS === 'web'
    ? { boxShadow: `0 0 0 4px ${transparent(auraColor, 0.52)}, 0 0 24px ${transparent(auraColor, 0.82)}, 0 0 58px ${transparent(auraColor, 0.5)}, inset 0 0 20px ${transparent(auraColor, 0.2)}` } as never
    : { shadowColor: auraColor, shadowOpacity: 0.92, shadowRadius: 34, elevation: 24 }) : undefined;
  const content = <Pressable onPress={onFocus} onHoverIn={onHoverIn} onHoverOut={onHoverOut} style={[styles.mapNode, { width: node.width, height: node.height, backgroundColor: challenging ? 'transparent' : background, borderColor: challenging ? 'transparent' : border, shadowColor: strategicEndpoint ? theme.gold : border, cursor: 'pointer' } as never, node.importance === 'major' && styles.milestoneNode, node.importance === 'large' && styles.largeNode, node.importance === 'medium' && styles.mediumNode, gateway && styles.gatewayNode, challenging && styles.challengingNode, thesis && styles.bossNode, thesisGlow, internship && styles.destinationNode, bossShape, destinationShape, unlocked && styles.availableNode, conquered && styles.conqueredNode, active && styles.activeNode, retake && styles.retakeNode, selected && styles.selectedNode, pathHighlighted && !selected && !challenging && { borderColor: relationColor }, strategicEndpoint && styles.strategicEndpointNode, directRelation && styles.directRelationNode, !thesis && !internship && !unlocked && !planned && !conquered && !active && !retake && styles.lockedNode, dimmed && styles.dimmedNode]}>
    {challenging && <Svg pointerEvents="none" width={node.width} height={node.height} style={StyleSheet.absoluteFill}><Polygon points={challengingPolygon(node.width, node.height)} fill={background} stroke={border} strokeWidth={selected || strategicEndpoint ? 7 : pathHighlighted || active ? 5 : 4} strokeLinejoin="round" /></Svg>}
    {thesis && <><View style={[styles.bossInnerFrame, { borderColor: transparent(border, 0.72), pointerEvents: 'none' }]} /><View style={[styles.bossCrest, { backgroundColor: border, shadowColor: border, pointerEvents: 'none' }]} /><View style={[styles.bossCornerLeft, { borderColor: border, pointerEvents: 'none' }]} /><View style={[styles.bossCornerRight, { borderColor: border, pointerEvents: 'none' }]} /></>}
    {internship && <><View style={[styles.destinationRailLeft, { backgroundColor: border, pointerEvents: 'none' }]} /><View style={[styles.destinationRailRight, { backgroundColor: border, shadowColor: border, pointerEvents: 'none' }]} /><View style={[styles.destinationEndpoint, { borderColor: border, backgroundColor: transparent(border, 0.2), pointerEvents: 'none' }]} /></>}
    {!challenging && <View style={[styles.departmentBar, { backgroundColor: departmentColor }]} />}
    {challenging && <View style={[styles.challengeAccent, { backgroundColor: departmentColor }]} />}
    {milestoneDesignation && <Text style={[styles.milestoneDesignation, internship && styles.destinationDesignation, { color: foreground }]}>{milestoneDesignation}</Text>}
    <View style={styles.nodeTop}><Text style={[styles.nodeCode, { color: foreground }]}>{node.course.code}</Text><Text style={[styles.nodeUnits, { color: foreground }]}>{combinedUnits}u</Text></View>
    <Text numberOfLines={node.importance === 'major' ? 3 : 2} style={[styles.nodeTitle, { color: foreground }, node.importance === 'major' && styles.milestoneTitle, thesis && styles.bossTitle, internship && styles.destinationTitle]}>{node.course.title}</Text>
    {relationLabel && <Text numberOfLines={1} style={[styles.relationLabel, { color: relationColor }]}>{relationLabel}</Text>}
    <View style={styles.nodeBottom}><Text numberOfLines={1} style={[styles.nodeStatus, { color: foreground }]}>{label}</Text>{roleLabel && <Text numberOfLines={1} style={[challenging ? styles.challengeLabel : styles.milestoneLabel, { color: challenging ? theme.warning : gateway ? theme.arrowCoe : foreground }]}>{roleLabel}</Text>}{available && <Draggable.Handle style={[styles.nodeDrag, { backgroundColor: theme.canvas }]}><Text style={[styles.nodeDragIcon, { color: theme.green700 }]}>⠿</Text></Draggable.Handle>}</View>
  </Pressable>;
  const aura = internship ? <><View style={[styles.milestoneAura, styles.destinationAura, { borderColor: transparent(auraColor, 0.58), backgroundColor: transparent(auraColor, 0.07), shadowColor: auraColor, pointerEvents: 'none' }]} /><View style={[styles.milestoneAuraInner, styles.destinationAuraInner, { borderColor: transparent(auraColor, 0.48), pointerEvents: 'none' }]} /></> : null;
  const nodeShell = <View style={styles.nodeShell}>{aura}{content}</View>;
  const position = { position: 'absolute' as const, left: node.x, top: node.y, width: node.width, height: node.height, zIndex: selected ? 25 : 12 };
  if (!available) return <View style={position}>{nodeShell}</View>;
  return <Draggable<RaidCourseDragData> key={`map-${node.course.code}-${dragVersion}`} data={{ kind: 'raid-course', courseCode: node.course.code }} draggableId={`map-${node.course.code}`} collisionAlgorithm="intersect" onDragStart={onDragStart} onStateChange={onDragState} style={[position, styles.draggableNode]}>{nodeShell}</Draggable>;
}

function RaidPlanner({ open, mobile, columns, workspace, raids, selectedRaid, availableCodes, editable, firstTermId, visibleCourses, ratings, selectedCourseCode, locatingCourseCode, currentRaidId, strategy, strategyRecommendations, dragVersion, draggingId, onOpenChange, onStrategyChange, onSelectRaid, onLocateCourse, onShowRecommendationPath, onExitLocate, onAdd, onRemove, onNewRaid, onRename, onDragStart, onDragState }: {
  open: boolean;
  mobile: boolean;
  columns: number;
  workspace: StudentWorkspace;
  raids: CurriculumTerm[];
  selectedRaid?: CurriculumTerm;
  availableCodes: Set<string>;
  editable: boolean;
  firstTermId?: string;
  visibleCourses: Course[];
  ratings: CourseRating[];
  selectedCourseCode: string | null;
  locatingCourseCode: string | null;
  currentRaidId?: string;
  strategy: RaidStrategyKind | null;
  strategyRecommendations: RaidStrategyRecommendation[];
  dragVersion: number;
  draggingId: string | null;
  onOpenChange: (open: boolean) => void;
  onStrategyChange: (strategy: RaidStrategyKind | null) => void;
  onSelectRaid: (id: string) => void;
  onLocateCourse: (code: string) => void;
  onShowRecommendationPath: (recommendation: RaidStrategyRecommendation) => void;
  onExitLocate: () => void;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onNewRaid: () => void;
  onRename: (termId: string, name: string) => void;
  onDragStart: (id: string) => void;
  onDragState: (state: DraggableState) => void;
}) {
  const theme = useAppTheme();
  if (!open) return <Pressable onPress={() => onOpenChange(true)} style={[styles.raidCollapsed, mobile && styles.raidCollapsedMobile, { backgroundColor: theme.green900 }]}><Text style={[styles.raidCollapsedIcon, { color: theme.gold }]}>⚔</Text><Text style={[styles.raidCollapsedText, mobile && styles.raidCollapsedTextMobile, { color: contrastText(theme.green900) }]}>RAID PLANNER</Text></Pressable>;
  if (locatingCourseCode) return <View style={[styles.raidLocatePanel, mobile && styles.raidLocatePanelMobile, { backgroundColor: theme.green900, borderColor: theme.gold, shadowColor: theme.gold }]}><View style={styles.raidLocateCopy}><Text style={[styles.raidLocateEyebrow, { color: theme.gold }]}>RAID PLANNER · MAP LOCATOR</Text><Text style={[styles.raidLocateTitle, { color: contrastText(theme.green900) }]}>Locating {locatingCourseCode}</Text></View><Pressable onPress={onExitLocate} style={[styles.raidLocateReturn, { backgroundColor: theme.gold }]}><Text style={[styles.raidLocateReturnText, { color: contrastText(theme.gold) }]}>← Return</Text></Pressable></View>;
  const curriculum = workspace.curriculum!;
  const currentRaidOrder = curriculum.terms.find((term) => term.id === currentRaidId)?.order;
  const planned = new Set(workspace.plannedCourseCodes ?? []);
  const roster = selectedRaid ? visibleCourses.filter((course) => planned.has(course.code) && workspace.plan[course.code] === selectedRaid.id) : [];
  const choices = visibleCourses.filter((course) => availableCodes.has(course.code));
  const fieldLabels = new Map(curriculumFieldDefinitions.map((field) => [field.id, field.label]));
  const warning = selectedRaid ? planWarnings(workspace).find((item) => item.termId === selectedRaid.id && (item.type === 'underload' || item.type === 'overload')) : undefined;
  const gwa = selectedRaid ? termGwa(workspace, selectedRaid.id) : null;
  const raidNumber = selectedRaid ? selectedRaid.order + 1 : 1;
  return (
    <View style={[styles.raidPanel, mobile && styles.raidPanelMobile, draggingId && styles.raidPanelDragging, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.green900 }]}>
      <View style={[styles.raidHeader, { backgroundColor: theme.green900 }]}>
        <View style={styles.raidHeaderCopy}><Text style={[styles.raidEyebrow, { color: theme.gold }]}>PLAN THE NEXT EXPEDITION</Text><Text style={[styles.raidTitle, { color: contrastText(theme.green900) }]}>Raid Planner</Text></View>
        <Pressable onPress={onNewRaid} style={[styles.newRaid, { backgroundColor: theme.gold }]}><Text style={[styles.newRaidText, { color: contrastText(theme.gold) }]}>＋ New raid</Text></Pressable>
        <Pressable onPress={() => onOpenChange(false)} style={[styles.collapseRaid, { backgroundColor: theme.green800 }]}><Text style={[styles.collapseRaidText, { color: contrastText(theme.green800) }]}>{mobile ? '↓' : '›'}</Text></Pressable>
      </View>
      <ScrollView style={styles.raidTabScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raidTabs}>
        {raids.map((term) => {
          const active = term.id === selectedRaid?.id;
          const current = term.id === currentRaidId;
          const name = workspace.raidNames?.[term.id]?.trim();
          const past = currentRaidOrder !== undefined && term.order < currentRaidOrder;
          const background = active ? theme.gold : current ? theme.activeSoft : theme.canvas;
          const foreground = active ? contrastText(theme.gold) : current ? theme.active : past ? theme.muted : theme.ink;
          return <Pressable key={term.id} onPress={() => onSelectRaid(term.id)} style={[styles.raidTab, current && styles.currentRaidTab, { backgroundColor: background, borderColor: current ? theme.active : active ? theme.gold : theme.border, opacity: past && !active ? 0.7 : 1 }]}><Text style={[styles.raidTabNumber, { color: foreground }]}>RAID {term.order + 1}</Text><Text numberOfLines={1} style={[styles.raidTabName, { color: foreground }]}>{current ? '● CURRENT RAID' : name || `Y${term.year} · T${term.term}`}</Text></Pressable>;
        })}
      </ScrollView>
      {selectedRaid && <>
        <View style={[styles.strategyBar, { borderBottomColor: theme.border }]}>
          <View style={styles.strategyIntro}><Text style={[styles.strategyTitle, { color: theme.ink }]}>Tatak Plan strategies</Text><Text style={[styles.strategyHelp, { color: theme.muted }]}>Highlight a route and compare strictly eligible next courses.</Text></View>
          <View style={styles.strategyButtons}>
            {([
              ['thesis', 'Thesis Priority'],
              ['internship', 'Internship Priority'],
              ['lighter', 'Lighter Workload'],
            ] as Array<[RaidStrategyKind, string]>).map(([kind, label]) => {
              const chosen = strategy === kind;
              return <Pressable key={kind} onPress={() => onStrategyChange(chosen ? null : kind)} style={[styles.strategyButton, { backgroundColor: chosen ? theme.green900 : theme.canvas, borderColor: chosen ? theme.gold : theme.border }]}><Text style={[styles.strategyButtonText, { color: chosen ? contrastText(theme.green900) : theme.ink }]}>{label}</Text></Pressable>;
            })}
          </View>
        </View>
        {strategy && <View style={[styles.strategyPanel, { backgroundColor: theme.green100, borderColor: strategy === 'lighter' ? theme.active : strategy === 'thesis' ? theme.arrowCpe : theme.arrowCoe }]}>
          <View style={styles.strategyPanelHeader}><View style={styles.strategyPanelCopy}><Text style={[styles.strategyPanelTitle, { color: theme.ink }]}>{strategy === 'thesis' ? 'THESIS PRIORITY' : strategy === 'internship' ? 'INTERNSHIP PRIORITY' : 'LIGHTER WORKLOAD'}</Text><Text style={[styles.strategyPanelHelp, { color: theme.muted }]}>{strategy === 'lighter' ? 'Uses community workload ratings when reliable; otherwise labels its conservative unit/lab heuristic.' : `The ${strategy} ancestry is highlighted. Feeder bottlenecks are prioritized; locked strategic courses name what must be cleared first.`}</Text></View><Pressable onPress={() => onStrategyChange(null)}><Text style={[styles.strategyClose, { color: theme.danger }]}>Close ×</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strategyRecommendations}>
            {strategyRecommendations.map((item, index) => {
              return <View key={item.courseCode} style={[styles.strategyRecommendation, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.strategyRank, { color: theme.green700 }]}>#{index + 1} · {item.courseCode}</Text>
                <Text numberOfLines={2} style={[styles.strategyCourseTitle, { color: theme.ink }]}>{item.courseTitle}</Text>
                {item.rating ? <View style={styles.strategyRating}><StarRating value={item.rating.average} size="xs" label={item.rating.criterion} valueColor={theme.muted} /><Text style={[styles.strategyRatingCriterion, { color: theme.muted }]}>{item.rating.criterion} · {item.rating.count}</Text></View> : <Text style={[styles.strategyRatingEmpty, { color: theme.muted }]}>No community rating yet</Text>}
                {item.pathText ? <><Text style={[styles.strategyRecommendedFor, { color: theme.green700 }]}>RECOMMENDED FOR {strategy === 'thesis' ? 'THESIS' : 'INTERNSHIP'} PRIORITY · {item.relationship.toUpperCase()}</Text><Text style={[styles.strategyWhy, { color: theme.green700 }]}>FEEDS</Text><Text numberOfLines={3} style={[styles.strategyPath, { color: theme.ink }]}>{item.pathText}</Text><Text style={[styles.strategyWhy, { color: theme.green700 }]}>WHY</Text><Text numberOfLines={2} style={[styles.strategyImpact, { color: theme.muted }]}>{item.impact}</Text><Text numberOfLines={3} style={[styles.strategyAvailability, { color: item.eligible ? theme.green700 : theme.danger }]}>{item.availabilityText}</Text></> : <><Text numberOfLines={3} style={[styles.strategyReason, { color: theme.ink }]}>{item.reason}</Text><Text style={[styles.strategySignal, { color: theme.muted }]}>{item.signal}</Text></>}
                <View style={styles.strategyActions}><Pressable disabled={!item.eligible} onPress={() => onAdd(item.courseCode)} style={[styles.strategyAdd, { backgroundColor: item.eligible ? theme.gold : theme.border, opacity: item.eligible ? 1 : 0.72 }]}><Text style={[styles.strategyAddText, { color: item.eligible ? contrastText(theme.gold) : theme.muted }]}>{item.eligible ? '＋ Add to Raid' : 'Locked'}</Text></Pressable>{item.strategicPath.length > 0 && <Pressable onPress={() => onShowRecommendationPath(item)} style={[styles.strategyPathButton, { backgroundColor: theme.canvas, borderColor: theme.arrowCpe }]}><Text style={[styles.strategyPathButtonText, { color: theme.green700 }]}>⌖ Show Path on Map</Text></Pressable>}</View>
              </View>;
            })}
            {strategyRecommendations.length === 0 && <Text style={[styles.strategyEmpty, { color: theme.muted }]}>No eligible course currently advances this strategy. Complete the highlighted gateway prerequisites first.</Text>}
          </ScrollView>
        </View>}
        <View style={styles.raidIdentity}>
          <View style={styles.raidIdentityCopy}><Text style={[styles.raidPeriod, { color: theme.green700 }]}>RAID {raidNumber} · {academicTermLabel(selectedRaid, workspace.academicProfile, curriculum.importedAt)}</Text><TextInput value={workspace.raidNames?.[selectedRaid.id] ?? ''} onChangeText={(value) => onRename(selectedRaid.id, value)} placeholder={`Name Raid ${raidNumber} (optional)`} placeholderTextColor={theme.muted} style={[styles.raidNameInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.canvas }]} /></View>
          <View style={styles.raidStats}><Stat value={`${termUnits(workspace, selectedRaid.id)}u`} label="Units" warning={Boolean(warning)} /><Stat value={gwa === null ? '—' : gwa.toFixed(2)} label="GWA" /><Stat value={`${roster.length}`} label="Courses" /></View>
        </View>
        {warning && <Text style={[styles.raidWarning, { color: theme.warning, backgroundColor: theme.warningSoft }]}>{warning.message}</Text>}
        <Droppable<RaidCourseDragData> droppableId={`raid-${selectedRaid.id}`} onDrop={(data) => onAdd(data.courseCode)} capacity={200} activeStyle={[styles.raidDropActive, { borderColor: theme.arrowCpe }]} style={[styles.rosterDrop, { borderColor: theme.border, backgroundColor: theme.canvas }]}>
          <Text style={[styles.sectionTitle, { color: theme.ink }]}>Raid roster</Text>
          <Text style={[styles.sectionHelp, { color: theme.muted }]}>{selectedRaid.id === firstTermId ? 'The first-term roster is fixed.' : editable ? 'Drop an available course here or use its Add button.' : 'Past raids are preserved as history.'}</Text>
          <ScrollView style={styles.rosterScroll} contentContainerStyle={styles.rosterGrid} nestedScrollEnabled>
            {roster.map((course) => {
              const status = workspace.statuses[course.code] ?? 'pending';
              const conquered = status === 'passed';
              const active = status === 'active';
              const background = conquered ? theme.green700 : active ? theme.activeSoft : theme.surface;
              const foreground = conquered ? contrastText(background) : active ? theme.active : theme.ink;
              return <Pressable key={course.code} onPress={() => onLocateCourse(course.code)} style={[styles.rosterCourse, { width: `${100 / Math.min(columns, 4) - 1.5}%` as `${number}%`, backgroundColor: background, borderColor: selectedCourseCode === course.code ? theme.arrowCpe : conquered ? theme.gold : active ? theme.active : theme.border }, active && styles.activeRaidCourse, selectedCourseCode === course.code && styles.raidCourseSelected]}><Text style={[styles.rosterCode, { color: conquered ? contrastText(background) : active ? theme.active : theme.green700 }]}>{course.code}</Text><Text numberOfLines={2} style={[styles.rosterTitle, { color: foreground }]}>{course.title}</Text><View style={styles.rosterBottom}><Text style={[styles.rosterStatus, { color: foreground }]}>{conquered ? '✓ CONQUERED' : active ? '● ACTIVE NOW' : 'PLANNED'}</Text><Text style={[styles.locateHint, { color: conquered ? contrastText(background) : active ? theme.active : theme.green700 }]}>⌖ Locate</Text>{editable && !conquered && !active && <Pressable onPress={(event) => { event.stopPropagation(); onRemove(course.code); }}><Text style={[styles.removeCourse, { color: theme.danger }]}>Remove</Text></Pressable>}</View></Pressable>;
            })}
            {roster.length === 0 && <Text style={[styles.emptyRoster, { color: theme.muted }]}>This raid has no courses yet.</Text>}
          </ScrollView>
        </Droppable>
        <View style={styles.availableHeading}><View><Text style={[styles.sectionTitle, { color: theme.ink }]}>Available choices</Text><Text style={[styles.sectionHelp, { color: theme.muted }]}>Courses unlocked by conquered or earlier-raid prerequisites.</Text></View><Text style={[styles.availableCount, { color: theme.arrowCpe }]}>{choices.length} READY</Text></View>
        <ScrollView style={styles.choiceScroll} contentContainerStyle={styles.choiceGrid}>
          {choices.map((course) => {
            const dragId = `choice-${course.code}`;
            const selected = selectedCourseCode === course.code;
            const units = courseBundleCodes(curriculum, course.code).reduce((sum, code) => sum + (curriculum.courses.find((candidate) => candidate.code === code)?.units ?? 0), 0);
            const field = fieldLabels.get(courseField(course)) ?? 'Course';
            const rating = courseRatingPreview(ratingSummary(course.code, ratings));
            const tile = <Pressable onPress={() => onLocateCourse(course.code)} style={[styles.choice, { backgroundColor: selected ? theme.green100 : theme.canvas, borderColor: selected ? theme.gold : theme.arrowCpe, shadowColor: selected ? theme.gold : theme.arrowCpe }, selected && styles.raidCourseSelected]}><View style={styles.choiceTop}><Text style={[styles.choiceCode, { color: theme.green700 }]}>{course.code}</Text><Text style={[styles.choiceUnits, { color: theme.muted }]}>{units}u</Text><Draggable.Handle style={[styles.choiceDrag, { backgroundColor: theme.surface }]}><Text style={[styles.choiceDragText, { color: theme.green700 }]}>⠿</Text></Draggable.Handle></View><Text numberOfLines={2} style={[styles.choiceTitle, { color: theme.ink }]}>{course.title}</Text><Text numberOfLines={1} style={[styles.choiceField, { color: theme.muted }]}>{field}</Text>{rating ? <View style={styles.choiceRating}><StarRating value={rating.average} size="xs" label="Overall rating" valueColor={theme.muted} /><Text style={[styles.choiceRatingCount, { color: theme.muted }]}>({rating.count})</Text></View> : <Text style={[styles.choiceRatingEmpty, { color: theme.muted }]}>No ratings yet</Text>}<Text style={[styles.choiceUnlocked, { color: theme.green700 }]}>✓ Prerequisites cleared · ⌖ Locate on map</Text><Pressable onPress={(event) => { event.stopPropagation(); onAdd(course.code); }} style={[styles.choiceAdd, { backgroundColor: theme.gold }]}><Text style={[styles.choiceAddText, { color: contrastText(theme.gold) }]}>＋ Add to Raid {raidNumber}</Text></Pressable></Pressable>;
            return <Draggable<RaidCourseDragData> key={`${dragId}-${dragVersion}`} data={{ kind: 'raid-course', courseCode: course.code }} draggableId={dragId} collisionAlgorithm="intersect" onDragStart={() => onDragStart(dragId)} onStateChange={onDragState} style={[styles.choiceSlot, { width: `${100 / columns - 1.4}%` as `${number}%` }]}>{tile}</Draggable>;
          })}
          {choices.length === 0 && <Text style={[styles.noChoices, { color: theme.muted }]}>{editable ? 'No additional courses are valid for this raid yet. Complete prerequisites or create the next raid.' : 'Select the current or a future raid to see available choices.'}</Text>}
        </ScrollView>
      </>}
    </View>
  );
}

function Stat({ value, label, warning }: { value: string; label: string; warning?: boolean }) {
  const theme = useAppTheme();
  return <View style={[styles.stat, { backgroundColor: warning ? theme.warningSoft : theme.canvas }]}><Text style={[styles.statValue, { color: warning ? theme.warning : theme.ink }]}>{value}</Text><Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text></View>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const theme = useAppTheme();
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: theme.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  hero: { minHeight: 92, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroMobile: { minHeight: 112, alignItems: 'flex-start' },
  heroCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 3, fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 4, maxWidth: 620, fontSize: 10, lineHeight: 15 },
  mapProgressRow: { marginTop: 8, maxWidth: 450, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mapProgressLabel: { width: 112, fontSize: 8, fontWeight: '900', letterSpacing: 0.35 },
  mapProgressTrack: { flex: 1, height: 6, borderRadius: 6, overflow: 'hidden' },
  mapProgressFill: { height: 6, borderRadius: 6 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  heroButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroButtonText: { fontSize: 9, fontWeight: '900' },
  raidButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  raidButtonText: { fontSize: 9, fontWeight: '900' },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  mapPane: { flex: 1, minWidth: 0, position: 'relative', zIndex: 1 },
  mapPaneDragging: { zIndex: 500, elevation: 500, overflow: 'visible' },
  mapCanvas: { position: 'relative' },
  startingRegion: { position: 'absolute', borderRadius: 34, borderWidth: 2, borderStyle: 'dashed', zIndex: 1 },
  startingRegionTitle: { position: 'absolute', left: 18, top: 14, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  fieldRegion: { position: 'absolute', borderRadius: 86, zIndex: 1 },
  fieldLabel: { position: 'absolute', paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  fieldLabelCopy: { flex: 1 },
  fieldMarker: { width: 11, height: 11, borderRadius: 6, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  fieldTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900', letterSpacing: 1.05 },
  fieldDescription: { marginTop: 2, maxWidth: 360, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  graphError: { position: 'absolute', top: 60, right: 14, width: 330, padding: 11, borderRadius: 13, borderWidth: 1.5, zIndex: 90, elevation: 20 },
  graphErrorTitle: { fontSize: 10, fontWeight: '900' },
  graphErrorText: { marginTop: 4, fontSize: 8, lineHeight: 12 },
  mapLegend: { position: 'absolute', minHeight: 38, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 30 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 7, fontWeight: '800' },
  nodeShell: { width: '100%', height: '100%', position: 'relative', overflow: 'visible' },
  milestoneAura: { position: 'absolute', left: -22, right: -22, top: -20, bottom: -20, borderWidth: 4, shadowOpacity: 0.9, shadowRadius: 34, elevation: 8 },
  milestoneAuraInner: { position: 'absolute', left: -11, right: -11, top: -10, bottom: -10, borderWidth: 2, shadowOpacity: 0.6, shadowRadius: 18, elevation: 9 },
  destinationAura: { left: -34, right: -48, top: -15, bottom: -15, borderRadius: 48, borderWidth: 3 },
  destinationAuraInner: { left: -18, right: -30, top: -8, bottom: -8, borderRadius: 40 },
  mapNode: { padding: 11, borderRadius: 15, borderWidth: 2, overflow: 'hidden', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, zIndex: 1 },
  challengingNode: { paddingHorizontal: 22, borderRadius: 0 },
  draggableNode: { zIndex: 18, elevation: 18 },
  milestoneNode: { borderWidth: 4, borderRadius: 20, shadowOpacity: 0.3, shadowRadius: 20, elevation: 14 },
  bossNode: { paddingHorizontal: 20, paddingVertical: 16, borderWidth: 6, borderRadius: 4, shadowOpacity: 0.58, shadowRadius: 28, elevation: 22 },
  bossInnerFrame: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 8, borderWidth: 2 },
  bossCrest: { position: 'absolute', top: 0, left: '34%', width: '32%', height: 7, shadowOpacity: 0.75, shadowRadius: 12, elevation: 24 },
  bossCornerLeft: { position: 'absolute', left: 7, top: 7, width: 24, height: 24, borderLeftWidth: 4, borderTopWidth: 4 },
  bossCornerRight: { position: 'absolute', right: 7, bottom: 7, width: 24, height: 24, borderRightWidth: 4, borderBottomWidth: 4 },
  destinationNode: { paddingLeft: 25, paddingRight: 40, paddingVertical: 14, borderWidth: 5, borderRadius: 3, shadowOpacity: 0.4, shadowRadius: 23, elevation: 19 },
  destinationRailLeft: { position: 'absolute', left: 8, top: 16, bottom: 16, width: 5 },
  destinationRailRight: { position: 'absolute', right: 24, top: 12, bottom: 12, width: 8, shadowOpacity: 0.65, shadowRadius: 12, elevation: 20 },
  destinationEndpoint: { position: 'absolute', right: 3, top: '40%', width: 22, height: 22, borderRadius: 11, borderWidth: 4 },
  largeNode: { borderWidth: 3.5, borderRadius: 18, shadowOpacity: 0.2, shadowRadius: 14, elevation: 10 },
  gatewayNode: { borderWidth: 4, shadowOpacity: 0.34, shadowRadius: 18, elevation: 14 },
  mediumNode: { borderWidth: 2.5, shadowOpacity: 0.13, shadowRadius: 10, elevation: 6 },
  availableNode: { borderWidth: 3, shadowOpacity: 0.34, shadowRadius: 15, elevation: 12 },
  conqueredNode: { borderWidth: 4, shadowOpacity: 0.35, shadowRadius: 16, elevation: 12 },
  activeNode: { borderWidth: 4, shadowOpacity: 0.40, shadowRadius: 18, elevation: 14 },
  retakeNode: { borderWidth: 4, shadowOpacity: 0.24, shadowRadius: 13, elevation: 10 },
  selectedNode: { borderWidth: 5, transform: [{ scale: 1.035 }], shadowOpacity: 0.48, shadowRadius: 20, elevation: 20 },
  strategicEndpointNode: { borderWidth: 7, shadowOpacity: 0.82, shadowRadius: 34, elevation: 28 },
  directRelationNode: { borderWidth: 5, shadowOpacity: 0.38, shadowRadius: 17, elevation: 16 },
  lockedNode: { opacity: 0.48, shadowOpacity: 0 },
  dimmedNode: { opacity: 0.16, shadowOpacity: 0 },
  departmentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  challengeAccent: { position: 'absolute', left: 13, right: 13, top: 2, height: 4, borderRadius: 2 },
  nodeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nodeCode: { fontSize: 11, fontWeight: '900' },
  nodeUnits: { fontSize: 8, fontWeight: '900' },
  nodeTitle: { marginTop: 7, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  milestoneTitle: { fontSize: 14, lineHeight: 18 },
  milestoneDesignation: { marginBottom: 5, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.35 },
  destinationDesignation: { letterSpacing: 1.05 },
  bossTitle: { marginTop: 9, fontSize: 18, lineHeight: 22, fontWeight: '900', letterSpacing: 0.25 },
  destinationTitle: { marginTop: 7, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  relationLabel: { marginTop: 5, fontSize: 6.5, fontWeight: '900', letterSpacing: 0.55 },
  nodeBottom: { marginTop: 'auto', paddingTop: 7, flexDirection: 'row', alignItems: 'center', gap: 7 },
  nodeStatus: { flex: 1, minWidth: 0, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  challengeLabel: { flexShrink: 0, fontSize: 5.8, fontWeight: '900', letterSpacing: 0.55, textAlign: 'right' },
  milestoneLabel: { flexShrink: 0, fontSize: 6.2, fontWeight: '900', letterSpacing: 0.5, textAlign: 'right' },
  nodeDrag: { width: 29, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  nodeDragIcon: { fontSize: 16, fontWeight: '900' },
  focusCard: { position: 'absolute', left: 14, bottom: 84, width: 330, padding: 13, borderRadius: 16, borderWidth: 2, zIndex: 80, shadowOpacity: 0.2, shadowRadius: 14, elevation: 18 },
  focusTop: { flexDirection: 'row', alignItems: 'flex-start' },
  focusCode: { fontSize: 10, fontWeight: '900' },
  focusTitle: { marginTop: 3, width: 260, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  focusClose: { paddingHorizontal: 7, fontSize: 18, fontWeight: '900' },
  focusMeta: { marginTop: 7, fontSize: 9, lineHeight: 13 },
  focusActions: { marginTop: 10, flexDirection: 'row', gap: 6 },
  addButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontSize: 8, fontWeight: '900' },
  detailButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  detailButtonText: { fontSize: 8, fontWeight: '900' },
  raidPanel: { position: 'absolute', right: 10, top: -86, bottom: -8, width: '92%', maxWidth: 1240, minWidth: 680, borderWidth: 1, borderRadius: 20, overflow: 'hidden', zIndex: 900, elevation: 90, shadowOpacity: 0.32, shadowRadius: 30 },
  raidPanelMobile: { left: 6, right: 6, top: -108, bottom: -8, width: 'auto', minWidth: 0, borderWidth: 1, borderRadius: 18, zIndex: 900, elevation: 90 },
  raidPanelDragging: { overflow: 'visible' },
  raidLocatePanel: { position: 'absolute', right: 12, top: 60, width: 400, minHeight: 72, padding: 11, borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', zIndex: 900, elevation: 90, shadowOpacity: 0.36, shadowRadius: 24 },
  raidLocatePanelMobile: { left: 10, right: 10, top: 58, width: 'auto' },
  raidLocateCopy: { flex: 1 },
  raidLocateEyebrow: { fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  raidLocateTitle: { marginTop: 4, fontSize: 13, fontWeight: '900' },
  raidLocateReturn: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  raidLocateReturnText: { fontSize: 8, fontWeight: '900' },
  raidCollapsed: { position: 'absolute', right: 0, top: 49, bottom: 82, width: 44, alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  raidCollapsedMobile: { left: 12, right: 12, top: 'auto', bottom: 84, width: 'auto', height: 50, borderRadius: 15, flexDirection: 'row', gap: 8, zIndex: 500 },
  raidCollapsedIcon: { fontSize: 18 },
  raidCollapsedText: { width: 130, textAlign: 'center', transform: [{ rotate: '-90deg' }], fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  raidCollapsedTextMobile: { width: 'auto', transform: [], fontSize: 9 },
  raidHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  raidHeaderCopy: { flex: 1 },
  raidEyebrow: { fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  raidTitle: { marginTop: 1, fontSize: 20, fontWeight: '900' },
  newRaid: { minHeight: 35, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  newRaidText: { fontSize: 8, fontWeight: '900' },
  collapseRaid: { width: 34, height: 35, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  collapseRaidText: { fontSize: 18, fontWeight: '900' },
  raidTabScroll: { flexGrow: 0, flexShrink: 0, height: 53 },
  raidTabs: { height: 53, paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: 'center' },
  raidTab: { width: 90, minHeight: 39, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  currentRaidTab: { borderWidth: 3, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  raidTabNumber: { fontSize: 8, fontWeight: '900' },
  raidTabName: { marginTop: 3, fontSize: 7.5, fontWeight: '700' },
  strategyBar: { paddingHorizontal: 13, paddingVertical: 8, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  strategyIntro: { flex: 1, minWidth: 180 },
  strategyTitle: { fontSize: 10, fontWeight: '900' },
  strategyHelp: { marginTop: 2, fontSize: 7.5, lineHeight: 11 },
  strategyButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  strategyButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  strategyButtonText: { fontSize: 7, fontWeight: '900' },
  strategyPanel: { marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 13, borderWidth: 2 },
  strategyPanelHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  strategyPanelCopy: { flex: 1 },
  strategyPanelTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  strategyPanelHelp: { marginTop: 3, fontSize: 7.5, lineHeight: 11 },
  strategyClose: { paddingHorizontal: 7, paddingVertical: 2, fontSize: 7.5, fontWeight: '900' },
  strategyRecommendations: { paddingTop: 8, gap: 6 },
  strategyRecommendation: { width: 306, minHeight: 224, padding: 11, borderRadius: 12, borderWidth: 1.5 },
  strategyRank: { fontSize: 8, fontWeight: '900' },
  strategyCourseTitle: { marginTop: 3, minHeight: 24, fontSize: 9.5, lineHeight: 12, fontWeight: '900' },
  strategyRating: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  strategyRatingCriterion: { fontSize: 6.5, lineHeight: 9, fontWeight: '800' },
  strategyRatingEmpty: { marginTop: 5, fontSize: 7.5, lineHeight: 10, fontWeight: '800' },
  strategyRecommendedFor: { marginTop: 7, fontSize: 6.3, lineHeight: 9, fontWeight: '900', letterSpacing: 0.55 },
  strategyWhy: { marginTop: 8, fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 0.8 },
  strategyPath: { marginTop: 3, minHeight: 24, fontSize: 8, lineHeight: 12, fontWeight: '900' },
  strategyImpact: { marginTop: 4, minHeight: 20, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  strategyAvailability: { marginTop: 5, fontSize: 6.8, lineHeight: 10, fontWeight: '900' },
  strategyReason: { marginTop: 4, fontSize: 7.5, lineHeight: 11, fontWeight: '700' },
  strategySignal: { marginTop: 4, fontSize: 6.5, fontWeight: '800' },
  strategyActions: { marginTop: 'auto', paddingTop: 8, flexDirection: 'row', gap: 5 },
  strategyAdd: { flex: 1, minHeight: 28, paddingHorizontal: 5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  strategyAddText: { fontSize: 7, fontWeight: '900' },
  strategyPathButton: { flex: 1.25, minHeight: 28, paddingHorizontal: 5, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  strategyPathButtonText: { fontSize: 6.7, fontWeight: '900' },
  strategyEmpty: { paddingVertical: 14, fontSize: 8, lineHeight: 12 },
  raidIdentity: { minHeight: 58, paddingHorizontal: 14, paddingBottom: 7, flexDirection: 'row', alignItems: 'center' },
  raidIdentityCopy: { flex: 1, marginRight: 8 },
  raidPeriod: { marginBottom: 5, fontSize: 8, fontWeight: '900' },
  raidNameInput: { height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, fontSize: 10, fontWeight: '800' },
  raidStats: { flexDirection: 'row', gap: 5 },
  stat: { width: 58, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 12, fontWeight: '900' },
  statLabel: { marginTop: 2, fontSize: 6.5, fontWeight: '800' },
  raidWarning: { marginHorizontal: 13, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, fontSize: 8, fontWeight: '800' },
  rosterDrop: { marginHorizontal: 12, minHeight: 102, maxHeight: 168, padding: 10, borderRadius: 14, borderWidth: 1.5 },
  raidDropActive: { borderWidth: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '900' },
  sectionHelp: { marginTop: 2, fontSize: 8, lineHeight: 12 },
  rosterScroll: { marginTop: 7, maxHeight: 105 },
  rosterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 3 },
  rosterCourse: { minHeight: 70, padding: 8, borderRadius: 10, borderWidth: 1.5 },
  activeRaidCourse: { borderWidth: 3, shadowOpacity: 0.22, shadowRadius: 10, elevation: 8 },
  raidCourseSelected: { borderWidth: 4, shadowOpacity: 0.34, shadowRadius: 14, elevation: 16 },
  rosterCode: { fontSize: 9, fontWeight: '900' },
  rosterTitle: { marginTop: 4, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  rosterBottom: { marginTop: 'auto', paddingTop: 5, flexDirection: 'row' },
  rosterStatus: { flex: 1, fontSize: 6.5, fontWeight: '900' },
  locateHint: { marginRight: 8, fontSize: 6.5, fontWeight: '900' },
  removeCourse: { fontSize: 6.5, fontWeight: '900' },
  emptyRoster: { paddingVertical: 20, textAlign: 'center', fontSize: 9 },
  availableHeading: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availableCount: { fontSize: 8, fontWeight: '900' },
  choiceScroll: { flex: 1 },
  choiceGrid: { padding: 12, paddingTop: 4, paddingBottom: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 8, overflow: 'visible' },
  choiceSlot: { zIndex: 20, elevation: 20 },
  choice: { minHeight: 148, padding: 10, borderRadius: 13, borderWidth: 2, shadowOpacity: 0.14, shadowRadius: 8 },
  choiceTop: { flexDirection: 'row', alignItems: 'center' },
  choiceCode: { flex: 1, fontSize: 9, fontWeight: '900' },
  choiceUnits: { marginRight: 7, fontSize: 8, fontWeight: '900' },
  choiceDrag: { width: 28, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  choiceDragText: { fontSize: 16, fontWeight: '900' },
  choiceTitle: { marginTop: 5, fontSize: 8.5, lineHeight: 12, fontWeight: '800' },
  choiceField: { marginTop: 4, fontSize: 7, fontWeight: '800' },
  choiceRating: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  choiceRatingCount: { fontSize: 6.5, fontWeight: '800' },
  choiceRatingEmpty: { marginTop: 5, fontSize: 7.5, fontWeight: '800' },
  choiceUnlocked: { marginTop: 6, fontSize: 7, fontWeight: '900' },
  choiceAdd: { marginTop: 'auto', minHeight: 29, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  choiceAddText: { fontSize: 7, fontWeight: '900' },
  noChoices: { width: '100%', padding: 22, textAlign: 'center', fontSize: 9, lineHeight: 14 },
});
