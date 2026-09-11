import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Draggable, DraggableState, Droppable, DropProvider } from 'react-native-reanimated-dnd';
import { Course, CourseRating, CourseStatus, CurriculumTerm, StudentWorkspace } from '../types';
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
import { academicTermLabel } from '../domain/academicCalendar';
import { courseDepartment } from '../domain/coursePresentation';
import { ratingSummary } from '../services/ratings';
import { CourseDetailsModal } from './CourseDetailsModal';
import { CurriculumGraphEdges } from './CurriculumGraphEdges';
import { CurriculumMapViewport, MapFocusRequest } from './CurriculumMapViewport';

interface RaidCourseDragData {
  kind: 'raid-course';
  courseCode: string;
}

const transparent = (hex: string, opacity: number) => /^#[0-9A-F]{6}$/i.test(hex)
  ? `${hex}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`
  : hex;

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
  const [dragVersion, setDragVersion] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  if (!curriculum) return null;

  const graph = useMemo(() => buildCurriculumGraph(curriculum, ratings), [curriculum, ratings]);
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const visibleCourses = visibleCurriculumCourses(curriculum);
  const plannedCodes = new Set(workspace.plannedCourseCodes ?? []);
  const allTerms = plannerTerms(workspace);
  const raidIds = workspace.plannerTermIds ?? [];
  const raids = allTerms.filter((term) => raidIds.includes(term.id)).sort((left, right) => left.order - right.order);
  const selectedRaid = raids.find((term) => term.id === selectedRaidId) ?? raids.at(-1) ?? raids[0];
  const currentOrder = allTerms.find((term) => term.id === workspace.academicProfile?.currentTermId)?.order ?? 0;
  const firstTermId = [...curriculum.terms].sort((left, right) => left.order - right.order)[0]?.id;
  const editableRaid = Boolean(selectedRaid && selectedRaid.id !== firstTermId && selectedRaid.order >= currentOrder);
  const availableCodes = selectedRaid && editableRaid ? availableCourseCodesForRaid(workspace, selectedRaid.id) : new Set<string>();
  const selectedCourse = selectedCourseCode ? byCode.get(selectedCourseCode) ?? null : null;
  const inspectedCourseCode = selectedCourseCode ?? hoveredCourseCode;
  const inspectedPath = inspectedCourseCode ? graphPathForCourse(graph, inspectedCourseCode) : {
    courseCodes: new Set<string>(), edgeKeys: new Set<string>(), ancestors: new Set<string>(), descendants: new Set<string>(), directPrerequisites: new Set<string>(), directDependents: new Set<string>(),
  };

  useEffect(() => {
    if (!selectedRaid || raidIds.includes(selectedRaidId)) return;
    setSelectedRaidId(raids.at(-1)?.id ?? '');
  }, [raidIds.join('|')]);

  useEffect(() => {
    setFocus({
      token: Date.now(),
      x: graph.startingRegion.x + graph.startingRegion.width / 2,
      y: graph.startingRegion.y + graph.startingRegion.height / 2,
      zoom: mobile ? 0.62 : 0.72,
    });
  }, [curriculum.id]);

  const bundleStatus = (course: Course): CourseStatus => {
    const statuses = courseBundleCodes(curriculum, course.code).map((code) => workspace.statuses[code] ?? 'pending');
    if (statuses.every((status) => status === 'passed')) return 'passed';
    if (statuses.some((status) => status === 'active')) return 'active';
    if (statuses.some((status) => status === 'retake')) return 'retake';
    return 'pending';
  };
  const focusCourse = (code: string, showDetails = false) => {
    const node = graph.nodes.find((candidate) => candidate.course.code === code);
    if (!node) return;
    setSelectedCourseCode(code);
    setFocus({ token: Date.now(), x: node.x + node.width / 2, y: node.y + node.height / 2 });
    if (showDetails) setDetailsVisible(true);
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
    focusCourse(courseCode);
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
            <Pressable onPress={() => setRaidOpen(true)} style={[styles.raidButton, { backgroundColor: theme.gold }]}><Text style={[styles.raidButtonText, { color: contrastText(theme.gold) }]}>⚔ Raid Planner</Text></Pressable>
          </View>
        </View>
        <View style={styles.body}>
          <View style={[styles.mapPane, draggingId && styles.mapPaneDragging]}>
            <CurriculumMapViewport contentWidth={graph.width} contentHeight={graph.height} focus={focus} dragging={Boolean(draggingId)}>
              {(panHandlers, panning) => (
                <View style={[styles.mapCanvas, { width: graph.width, height: graph.height }]}>
                  <View nativeID="curriculum-map-pan" style={[StyleSheet.absoluteFillObject, { cursor: panning ? 'grabbing' : 'grab' } as never]} {...panHandlers} />
                  <View pointerEvents="none" style={[styles.startingRegion, { left: graph.startingRegion.x, top: graph.startingRegion.y, width: graph.startingRegion.width, height: graph.startingRegion.height, borderColor: transparent(theme.gold, 0.55), backgroundColor: transparent(theme.gold, 0.07) }]}><Text style={[styles.startingRegionTitle, { color: theme.gold }]}>START · FIRST YEAR / FIRST TERM</Text></View>
                  {graph.fields.map((field) => {
                    const accent = fieldAccent(field.id, theme);
                    const relevant = !inspectedCourseCode || graph.nodes.some((node) => node.fieldId === field.id && inspectedPath.courseCodes.has(node.course.code));
                    return <React.Fragment key={field.id}><View style={[styles.fieldRegion, { left: field.bounds.x, top: field.bounds.y, width: field.bounds.width, height: field.bounds.height, backgroundColor: transparent(accent, 0.075), opacity: relevant ? 1 : 0.16, pointerEvents: 'none' }]} /><View style={[styles.fieldLabel, { left: field.labelBounds.x, top: field.labelBounds.y, width: field.labelBounds.width, height: field.labelBounds.height, backgroundColor: transparent(accent, 0.09), borderColor: accent, opacity: relevant ? 1 : 0.16, pointerEvents: 'none' }]}><View style={[styles.fieldMarker, { backgroundColor: accent, shadowColor: accent }]} /><View style={styles.fieldLabelCopy}><Text numberOfLines={1} style={[styles.fieldTitle, { color: theme.ink }]}>{field.label.toUpperCase()}</Text><Text numberOfLines={2} style={[styles.fieldDescription, { color: theme.muted }]}>{field.description}</Text></View></View></React.Fragment>;
                  })}
                  <CurriculumGraphEdges layout={graph} highlightedEdgeKeys={inspectedPath.edgeKeys} showEveryArrow={showEveryArrow} />
                  {graph.nodes.map((node) => {
                    const status = bundleStatus(node.course);
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
                      available={available}
                      selected={selected}
                      pathHighlighted={inspectedPath.courseCodes.has(node.course.code)}
                      relation={relation}
                      directRelation={inspectedPath.directPrerequisites.has(node.course.code) || inspectedPath.directDependents.has(node.course.code)}
                      dimmed={Boolean(inspectedCourseCode && !inspectedPath.courseCodes.has(node.course.code))}
                      inSelectedRaid={inSelectedRaid}
                      planned={plannedCodes.has(node.course.code)}
                      combinedUnits={courseBundleCodes(curriculum, node.course.code).reduce((sum, code) => sum + (byCode.get(code)?.units ?? 0), 0)}
                      dragVersion={dragVersion}
                      onFocus={() => focusCourse(node.course.code)}
                      onHoverIn={() => setHoveredCourseCode(node.course.code)}
                      onHoverOut={() => setHoveredCourseCode((current) => current === node.course.code ? null : current)}
                      onDragStart={() => setDraggingId(`map-${node.course.code}`)}
                      onDragState={(state) => { if (state === DraggableState.IDLE || state === DraggableState.DROPPED) setDraggingId(null); }}
                    />;
                  })}
                  <View style={[styles.mapLegend, { left: 80, top: 40, backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <LegendDot color={theme.green700} label="Conquered" />
                    <LegendDot color={theme.gold} label="Active raid" />
                    <LegendDot color={theme.arrowCpe} label="Available" />
                    <LegendDot color={theme.danger} label="Retake" />
                    <LegendDot color={theme.muted} label="Locked" />
                  </View>
                </View>
              )}
            </CurriculumMapViewport>
            {graph.validationErrors.length > 0 && <View style={[styles.graphError, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}><Text style={[styles.graphErrorTitle, { color: theme.danger }]}>Curriculum data needs attention</Text><Text numberOfLines={3} style={[styles.graphErrorText, { color: theme.ink }]}>{graph.validationErrors.join('\n')}</Text></View>}
            {selectedCourse && <View style={[styles.focusCard, { backgroundColor: theme.surface, borderColor: theme.arrowCpe }]}>
              <View style={styles.focusTop}><View><Text style={[styles.focusCode, { color: theme.green700 }]}>{selectedCourse.code}</Text><Text numberOfLines={2} style={[styles.focusTitle, { color: theme.ink }]}>{selectedCourse.title}</Text></View><Pressable onPress={() => setSelectedCourseCode(null)}><Text style={[styles.focusClose, { color: theme.muted }]}>×</Text></Pressable></View>
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
            selectedCourseCode={selectedCourseCode}
            dragVersion={dragVersion}
            draggingId={draggingId}
            onOpenChange={setRaidOpen}
            onSelectRaid={setSelectedRaidId}
            onFocusCourse={(code) => { focusCourse(code); if (mobile) setRaidOpen(false); }}
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

function MapCourseNode({ node, status, available, selected, pathHighlighted, relation, directRelation, dimmed, inSelectedRaid, planned, combinedUnits, dragVersion, onFocus, onHoverIn, onHoverOut, onDragStart, onDragState }: {
  node: CurriculumGraphNode;
  status: CourseStatus;
  available: boolean;
  selected: boolean;
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
  const conquered = status === 'passed';
  const active = status === 'active';
  const retake = status === 'retake';
  const background = conquered ? theme.green700 : active ? theme.gold : retake ? theme.dangerSoft : inSelectedRaid ? theme.green100 : theme.surface;
  const foreground = conquered || active ? contrastText(background) : theme.ink;
  const relationColor = relation === 'ancestor' ? theme.arrowCoe : relation === 'descendant' ? theme.arrowCpe : theme.gold;
  const border = selected ? theme.gold : pathHighlighted ? relationColor : conquered ? theme.gold : active ? theme.arrowCpe : retake ? theme.danger : available ? theme.arrowCpe : node.difficult ? theme.arrowCoe : departmentColor;
  const label = conquered ? '✓ CONQUERED' : active ? '⚔ ACTIVE RAID' : retake ? '↻ RETAKE NEEDED' : inSelectedRaid ? 'IN THIS RAID' : planned ? 'PLANNED' : available ? '✦ AVAILABLE' : 'LOCKED';
  const relationLabel = relation === 'ancestor' ? (directRelation ? 'DIRECT PREREQUISITE' : 'PREREQUISITE PATH') : relation === 'descendant' ? (directRelation ? 'DIRECTLY UNLOCKS' : 'DEPENDENT PATH') : null;
  const thesis = node.milestoneKind === 'thesis';
  const internship = node.milestoneKind === 'internship';
  const milestoneDesignation = thesis ? 'THESIS · BOSS ENCOUNTER' : internship ? 'INTERNSHIP · FINAL DESTINATION' : null;
  const bossShape = Platform.OS === 'web' && thesis ? { clipPath: 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)' } as never : undefined;
  const destinationShape = Platform.OS === 'web' && internship ? { clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 50%, calc(100% - 30px) 100%, 0 100%, 14px 50%)' } as never : undefined;
  const content = <Pressable onPress={onFocus} onHoverIn={onHoverIn} onHoverOut={onHoverOut} style={[styles.mapNode, { width: node.width, height: node.height, backgroundColor: background, borderColor: border, shadowColor: border, cursor: 'pointer' } as never, node.importance === 'major' && styles.milestoneNode, node.importance === 'large' && styles.largeNode, node.importance === 'medium' && styles.mediumNode, thesis && styles.bossNode, internship && styles.destinationNode, bossShape, destinationShape, available && styles.availableNode, conquered && styles.conqueredNode, active && styles.activeNode, retake && styles.retakeNode, selected && styles.selectedNode, pathHighlighted && !selected && { borderColor: relationColor }, directRelation && styles.directRelationNode, !available && !planned && !conquered && !active && !retake && styles.lockedNode, dimmed && styles.dimmedNode]}>
    {thesis && <><View style={[styles.bossInnerFrame, { borderColor: transparent(border, 0.72), pointerEvents: 'none' }]} /><View style={[styles.bossCrest, { backgroundColor: border, shadowColor: border, pointerEvents: 'none' }]} /><View style={[styles.bossCornerLeft, { borderColor: border, pointerEvents: 'none' }]} /><View style={[styles.bossCornerRight, { borderColor: border, pointerEvents: 'none' }]} /></>}
    {internship && <><View style={[styles.destinationRailLeft, { backgroundColor: border, pointerEvents: 'none' }]} /><View style={[styles.destinationRailRight, { backgroundColor: border, shadowColor: border, pointerEvents: 'none' }]} /><View style={[styles.destinationEndpoint, { borderColor: border, backgroundColor: transparent(border, 0.2), pointerEvents: 'none' }]} /></>}
    <View style={[styles.departmentBar, { backgroundColor: departmentColor }]} />
    {milestoneDesignation && <Text style={[styles.milestoneDesignation, internship && styles.destinationDesignation, { color: foreground }]}>{milestoneDesignation}</Text>}
    <View style={styles.nodeTop}><Text style={[styles.nodeCode, { color: foreground }]}>{node.course.code}</Text><Text style={[styles.nodeUnits, { color: foreground }]}>{combinedUnits}u</Text></View>
    <Text numberOfLines={node.importance === 'major' ? 3 : 2} style={[styles.nodeTitle, { color: foreground }, node.importance === 'major' && styles.milestoneTitle, thesis && styles.bossTitle, internship && styles.destinationTitle]}>{node.course.title}</Text>
    {relationLabel && <Text numberOfLines={1} style={[styles.relationLabel, { color: relationColor }]}>{relationLabel}</Text>}
    <View style={styles.nodeBottom}><Text style={[styles.nodeStatus, { color: foreground }]}>{label}</Text>{node.importance === 'major' && !milestoneDesignation && <Text style={[styles.milestoneLabel, { color: foreground }]}>MILESTONE</Text>}{available && <Draggable.Handle style={[styles.nodeDrag, { backgroundColor: theme.canvas }]}><Text style={[styles.nodeDragIcon, { color: theme.green700 }]}>⠿</Text></Draggable.Handle>}</View>
  </Pressable>;
  const position = { position: 'absolute' as const, left: node.x, top: node.y, width: node.width, height: node.height, zIndex: selected ? 25 : 12 };
  if (!available) return <View style={position}>{content}</View>;
  return <Draggable<RaidCourseDragData> key={`map-${node.course.code}-${dragVersion}`} data={{ kind: 'raid-course', courseCode: node.course.code }} draggableId={`map-${node.course.code}`} collisionAlgorithm="intersect" onDragStart={onDragStart} onStateChange={onDragState} style={[position, styles.draggableNode]}>{content}</Draggable>;
}

function RaidPlanner({ open, mobile, columns, workspace, raids, selectedRaid, availableCodes, editable, firstTermId, visibleCourses, selectedCourseCode, dragVersion, draggingId, onOpenChange, onSelectRaid, onFocusCourse, onAdd, onRemove, onNewRaid, onRename, onDragStart, onDragState }: {
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
  selectedCourseCode: string | null;
  dragVersion: number;
  draggingId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectRaid: (id: string) => void;
  onFocusCourse: (code: string) => void;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onNewRaid: () => void;
  onRename: (termId: string, name: string) => void;
  onDragStart: (id: string) => void;
  onDragState: (state: DraggableState) => void;
}) {
  const theme = useAppTheme();
  if (!open) return <Pressable onPress={() => onOpenChange(true)} style={[styles.raidCollapsed, mobile && styles.raidCollapsedMobile, { backgroundColor: theme.green900 }]}><Text style={[styles.raidCollapsedIcon, { color: theme.gold }]}>⚔</Text><Text style={[styles.raidCollapsedText, mobile && styles.raidCollapsedTextMobile, { color: contrastText(theme.green900) }]}>RAID PLANNER</Text></Pressable>;
  const curriculum = workspace.curriculum!;
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
          const name = workspace.raidNames?.[term.id]?.trim();
          return <Pressable key={term.id} onPress={() => onSelectRaid(term.id)} style={[styles.raidTab, { backgroundColor: active ? theme.gold : theme.canvas, borderColor: active ? theme.gold : theme.border }]}><Text style={[styles.raidTabNumber, { color: active ? contrastText(theme.gold) : theme.ink }]}>RAID {term.order + 1}</Text><Text numberOfLines={1} style={[styles.raidTabName, { color: active ? contrastText(theme.gold) : theme.muted }]}>{name || `Y${term.year} · T${term.term}`}</Text></Pressable>;
        })}
      </ScrollView>
      {selectedRaid && <>
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
              const background = conquered ? theme.green700 : active ? theme.gold : theme.surface;
              return <Pressable key={course.code} onPress={() => onFocusCourse(course.code)} style={[styles.rosterCourse, { width: `${100 / Math.min(columns, 4) - 1.5}%` as `${number}%`, backgroundColor: background, borderColor: selectedCourseCode === course.code ? theme.arrowCpe : conquered ? theme.gold : active ? theme.arrowCpe : theme.border }, selectedCourseCode === course.code && styles.raidCourseSelected]}><Text style={[styles.rosterCode, { color: conquered || active ? contrastText(background) : theme.green700 }]}>{course.code}</Text><Text numberOfLines={2} style={[styles.rosterTitle, { color: conquered || active ? contrastText(background) : theme.ink }]}>{course.title}</Text><View style={styles.rosterBottom}><Text style={[styles.rosterStatus, { color: conquered || active ? contrastText(background) : theme.muted }]}>{conquered ? '✓ CONQUERED' : active ? '⚔ ACTIVE' : 'PLANNED'}</Text>{editable && !conquered && !active && <Pressable onPress={(event) => { event.stopPropagation(); onRemove(course.code); }}><Text style={[styles.removeCourse, { color: theme.danger }]}>Remove</Text></Pressable>}</View></Pressable>;
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
            const tile = <Pressable onPress={() => onFocusCourse(course.code)} style={[styles.choice, { backgroundColor: selected ? theme.green100 : theme.canvas, borderColor: selected ? theme.gold : theme.arrowCpe, shadowColor: selected ? theme.gold : theme.arrowCpe }, selected && styles.raidCourseSelected]}><View style={styles.choiceTop}><Text style={[styles.choiceCode, { color: theme.green700 }]}>{course.code}</Text><Text style={[styles.choiceUnits, { color: theme.muted }]}>{units}u</Text><Draggable.Handle style={[styles.choiceDrag, { backgroundColor: theme.surface }]}><Text style={[styles.choiceDragText, { color: theme.green700 }]}>⠿</Text></Draggable.Handle></View><Text numberOfLines={2} style={[styles.choiceTitle, { color: theme.ink }]}>{course.title}</Text><Text numberOfLines={1} style={[styles.choiceField, { color: theme.muted }]}>{field}</Text><Text style={[styles.choiceUnlocked, { color: theme.green700 }]}>✓ Prerequisites cleared</Text><Pressable onPress={(event) => { event.stopPropagation(); onAdd(course.code); }} style={[styles.choiceAdd, { backgroundColor: theme.gold }]}><Text style={[styles.choiceAddText, { color: contrastText(theme.gold) }]}>＋ Add to Raid {raidNumber}</Text></Pressable></Pressable>;
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
  fieldLabel: { position: 'absolute', paddingHorizontal: 18, paddingVertical: 12, borderLeftWidth: 6, borderBottomWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 13, zIndex: 5 },
  fieldLabelCopy: { flex: 1 },
  fieldMarker: { width: 16, height: 16, borderRadius: 8, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  fieldTitle: { fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: 1.15 },
  fieldDescription: { marginTop: 3, maxWidth: 360, fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  graphError: { position: 'absolute', top: 60, right: 14, width: 330, padding: 11, borderRadius: 13, borderWidth: 1.5, zIndex: 90, elevation: 20 },
  graphErrorTitle: { fontSize: 10, fontWeight: '900' },
  graphErrorText: { marginTop: 4, fontSize: 8, lineHeight: 12 },
  mapLegend: { position: 'absolute', minHeight: 38, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 30 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 7, fontWeight: '800' },
  mapNode: { padding: 11, borderRadius: 15, borderWidth: 2, overflow: 'hidden', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
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
  mediumNode: { borderWidth: 2.5, shadowOpacity: 0.13, shadowRadius: 10, elevation: 6 },
  availableNode: { borderWidth: 3, shadowOpacity: 0.34, shadowRadius: 15, elevation: 12 },
  conqueredNode: { borderWidth: 4, shadowOpacity: 0.35, shadowRadius: 16, elevation: 12 },
  activeNode: { borderWidth: 4, shadowOpacity: 0.40, shadowRadius: 18, elevation: 14 },
  retakeNode: { borderWidth: 4, shadowOpacity: 0.24, shadowRadius: 13, elevation: 10 },
  selectedNode: { borderWidth: 5, transform: [{ scale: 1.035 }], shadowOpacity: 0.48, shadowRadius: 20, elevation: 20 },
  directRelationNode: { borderWidth: 5, shadowOpacity: 0.38, shadowRadius: 17, elevation: 16 },
  lockedNode: { opacity: 0.48, shadowOpacity: 0 },
  dimmedNode: { opacity: 0.16, shadowOpacity: 0 },
  departmentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
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
  nodeBottom: { marginTop: 'auto', paddingTop: 7, flexDirection: 'row', alignItems: 'center' },
  nodeStatus: { flex: 1, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  milestoneLabel: { marginRight: 7, fontSize: 6.5, fontWeight: '900', letterSpacing: 0.6 },
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
  raidPanel: { position: 'absolute', right: 10, top: -80, bottom: -8, width: '92%', maxWidth: 1240, minWidth: 680, borderWidth: 1, borderRadius: 20, overflow: 'hidden', zIndex: 900, elevation: 90, shadowOpacity: 0.32, shadowRadius: 30 },
  raidPanelMobile: { left: 6, right: 6, top: -102, bottom: -8, width: 'auto', minWidth: 0, borderWidth: 1, borderRadius: 18, zIndex: 900, elevation: 90 },
  raidPanelDragging: { overflow: 'visible' },
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
  raidTabNumber: { fontSize: 8, fontWeight: '900' },
  raidTabName: { marginTop: 3, fontSize: 7.5, fontWeight: '700' },
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
  raidCourseSelected: { borderWidth: 4, shadowOpacity: 0.34, shadowRadius: 14, elevation: 16 },
  rosterCode: { fontSize: 9, fontWeight: '900' },
  rosterTitle: { marginTop: 4, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  rosterBottom: { marginTop: 'auto', paddingTop: 5, flexDirection: 'row' },
  rosterStatus: { flex: 1, fontSize: 6.5, fontWeight: '900' },
  removeCourse: { fontSize: 6.5, fontWeight: '900' },
  emptyRoster: { paddingVertical: 20, textAlign: 'center', fontSize: 9 },
  availableHeading: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availableCount: { fontSize: 8, fontWeight: '900' },
  choiceScroll: { flex: 1 },
  choiceGrid: { padding: 12, paddingTop: 4, paddingBottom: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 8, overflow: 'visible' },
  choiceSlot: { zIndex: 20, elevation: 20 },
  choice: { minHeight: 134, padding: 10, borderRadius: 13, borderWidth: 2, shadowOpacity: 0.14, shadowRadius: 8 },
  choiceTop: { flexDirection: 'row', alignItems: 'center' },
  choiceCode: { flex: 1, fontSize: 9, fontWeight: '900' },
  choiceUnits: { marginRight: 7, fontSize: 8, fontWeight: '900' },
  choiceDrag: { width: 28, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  choiceDragText: { fontSize: 16, fontWeight: '900' },
  choiceTitle: { marginTop: 5, fontSize: 8.5, lineHeight: 12, fontWeight: '800' },
  choiceField: { marginTop: 4, fontSize: 7, fontWeight: '800' },
  choiceUnlocked: { marginTop: 6, fontSize: 7, fontWeight: '900' },
  choiceAdd: { marginTop: 'auto', minHeight: 29, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  choiceAddText: { fontSize: 7, fontWeight: '900' },
  noChoices: { width: '100%', padding: 22, textAlign: 'center', fontSize: 9, lineHeight: 14 },
});
