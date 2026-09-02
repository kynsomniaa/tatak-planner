import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Draggable, DraggableState } from 'react-native-reanimated-dnd';
import { contrastText, useAppTheme } from '../theme';
import { Course, GoalKind, StudentGoal, StudentWorkspace } from '../types';
import { courseBundleCodes, visibleCurriculumCourses } from '../domain/academicSetup';
import { generateCourseChains } from '../domain/chains';
import { courseDepartment } from '../domain/coursePresentation';
import { coursePoolEligibility, tatakCourseRecommendations } from '../domain/planner';

export interface CoursePoolDragData {
  kind: 'pool';
  id: string;
  courseCode: string;
}

const goalOptions: Array<{ kind: Exclude<GoalKind, 'custom'>; name: string; icon: string }> = [
  { kind: 'earliest_graduation', name: 'Earliest graduation', icon: '↗' },
  { kind: 'lighter_workload', name: 'Lighter workload', icon: '☁' },
  { kind: 'thesis_readiness', name: 'Thesis readiness', icon: '◆' },
];

export function CoursePool({ workspace, onChange, onPickCourse, dragVersion }: {
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  onPickCourse: (course: Course, canPlan: boolean) => void;
  dragVersion: number;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 720;
  const curriculum = workspace.curriculum;
  const [mode, setMode] = useState<'open' | 'narrow'>(mobile ? 'narrow' : 'narrow');
  const [openPathIds, setOpenPathIds] = useState<Set<string>>(new Set());
  const [showTatak, setShowTatak] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  useEffect(() => setDraggingKey(null), [dragVersion]);
  if (!curriculum) return null;

  const visible = visibleCurriculumCourses(curriculum);
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const chains = useMemo(() => generateCourseChains(curriculum), [curriculum]);
  const groupedCodes = new Set(chains.flatMap((chain) => chain.courseCodes));
  const otherCourses = visible.filter((course) => !groupedCodes.has(course.code));
  const planned = new Set(workspace.plannedCourseCodes ?? []);
  const recommendations = workspace.goal && workspace.goal.kind !== 'custom'
    ? tatakCourseRecommendations(workspace, workspace.goal.kind)
    : [];

  const chooseGoal = (kind: Exclude<GoalKind, 'custom'>) => {
    const option = goalOptions.find((goal) => goal.kind === kind);
    const goal: StudentGoal = { id: kind, kind, name: option?.name ?? kind, notes: '', allowAiChanges: false };
    onChange({ ...workspace, goal, updatedAt: new Date().toISOString() });
  };
  const togglePath = (id: string) => setOpenPathIds((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const statusFor = (course: Course) => {
    const statuses = courseBundleCodes(curriculum, course.code).map((code) => workspace.statuses[code] ?? 'pending');
    if (statuses.every((status) => status === 'passed')) return 'passed' as const;
    if (statuses.some((status) => status === 'active')) return 'active' as const;
    if (statuses.some((status) => status === 'retake')) return 'retake' as const;
    return 'pending' as const;
  };

  if (mode === 'narrow') {
    return (
      <Pressable onPress={() => setMode('open')} style={[styles.narrow, mobile && styles.narrowMobile, { backgroundColor: theme.green900 }]}> 
        <Text style={[styles.narrowIcon, { color: contrastText(theme.green900) }]}>›</Text>
        <Text style={[styles.narrowLabel, { color: contrastText(theme.green900) }]}>COURSE POOL</Text>
      </Pressable>
    );
  }

  const renderCourse = (course: Course, groupId: string) => {
    const status = statusFor(course);
    const bundled = courseBundleCodes(curriculum, course.code);
    const isPlanned = bundled.some((code) => planned.has(code));
    const eligibility = coursePoolEligibility(workspace, course.code);
    const lockedByProgress = !eligibility.available;
    const locked = status === 'passed' || status === 'active' || isPlanned || lockedByProgress;
    const department = courseDepartment(course.code);
    const departmentColor = department === 'CPE' ? theme.green700 : department === 'COE' ? theme.gold : theme.green800;
    const statusLabel = status === 'passed'
      ? '✓ PASSED'
      : status === 'active'
      ? '● ACTIVE NOW'
      : isPlanned
      ? 'PLANNED'
      : lockedByProgress
      ? `LOCKED · NEED ${eligibility.missingPrerequisites.slice(0, 2).join(', ')}${eligibility.missingPrerequisites.length > 2 ? '…' : ''}`
      : status === 'retake' ? 'RETAKE READY' : 'AVAILABLE NOW';
    const dragKey = `${groupId}-${course.code}`;
    const dragging = draggingKey === dragKey;
    const tile = (
      <Pressable onPress={() => onPickCourse(course, !locked)} style={[styles.courseTile, { backgroundColor: status === 'passed' || status === 'active' ? theme.green100 : theme.canvas, borderColor: departmentColor }, lockedByProgress && { borderStyle: 'dashed' }, locked && styles.lockedTile, dragging && styles.draggingTile]}> 
        <View style={styles.courseTop}><Text style={[styles.courseCode, { color: departmentColor }]}>{course.code}</Text><Text style={[styles.units, { color: theme.muted }]}>{courseBundleCodes(curriculum, course.code).reduce((sum, code) => sum + (byCode.get(code)?.units ?? 0), 0)}u</Text></View>
        <Text numberOfLines={2} style={[styles.courseTitle, { color: theme.ink }]}>{course.title}</Text>
        <View style={styles.courseBottom}><Text numberOfLines={2} style={[styles.status, { color: lockedByProgress ? theme.warning : status === 'passed' || status === 'active' ? theme.green700 : theme.muted }]}>{statusLabel}</Text>{!locked && <Draggable.Handle style={[styles.dragHandle, { backgroundColor: theme.surface }]}><Text style={[styles.dragIcon, { color: theme.green700 }]}>⠿</Text></Draggable.Handle>}</View>
      </Pressable>
    );
    if (locked) return <View key={dragKey} style={styles.courseSlot}>{tile}</View>;
    return <Draggable<CoursePoolDragData>
      key={`${dragKey}-${dragVersion}`}
      data={{ kind: 'pool', id: dragKey, courseCode: course.code }}
      draggableId={`pool-${dragKey}`}
      collisionAlgorithm="intersect"
      onDragStart={() => setDraggingKey(dragKey)}
      onStateChange={(state) => { if (state === DraggableState.IDLE || state === DraggableState.DROPPED) setDraggingKey(null); }}
      style={[styles.courseSlot, dragging && styles.draggingSlot]}
    >{tile}</Draggable>;
  };

  return (
    <View style={[styles.sidebar, mobile && styles.sidebarMobile, draggingKey && styles.sidebarDragging, { backgroundColor: theme.surface, borderRightColor: theme.border, shadowColor: theme.green900 }]}> 
      <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: theme.green700 }]}>PATHWAY PLANNER</Text><Text style={[styles.title, { color: theme.ink }]}>Course Pool</Text></View><Pressable onPress={() => setMode('narrow')} style={[styles.close, { backgroundColor: theme.canvas }]}><Text style={[styles.closeText, { color: theme.ink }]}>‹</Text></Pressable></View>
      <Text style={[styles.help, { color: theme.muted }]}>Availability comes from your Academic Setup progress. Solid tiles are ready now; dashed locked tiles still need the listed prerequisite. Passed, active, and planned tiles stay visible but cannot be dragged.</Text>

      <Pressable onPress={() => setShowTatak((value) => !value)} style={[styles.tatakButton, { backgroundColor: theme.green900 }]}> 
        <View><Text style={[styles.tatakEyebrow, { color: theme.gold }]}>GUIDED RECOMMENDATIONS</Text><Text style={[styles.tatakTitle, { color: contrastText(theme.green900) }]}>Tatak Plan</Text></View><Text style={[styles.tatakChevron, { color: contrastText(theme.green900) }]}>{showTatak ? '−' : '+'}</Text>
      </Pressable>
      {showTatak && <View style={[styles.tatakPanel, { backgroundColor: theme.canvas, borderColor: theme.border }]}> 
        <View style={styles.goalGrid}>{goalOptions.map((goal) => { const active = workspace.goal?.kind === goal.kind; return <Pressable key={goal.kind} onPress={() => chooseGoal(goal.kind)} style={[styles.goal, { backgroundColor: active ? theme.green800 : theme.surface, borderColor: active ? theme.green800 : theme.border }]}><Text style={[styles.goalIcon, { color: active ? contrastText(theme.green800) : theme.green700 }]}>{goal.icon}</Text><Text style={[styles.goalName, { color: active ? contrastText(theme.green800) : theme.ink }]}>{goal.name}</Text></Pressable>; })}</View>
        {workspace.goal && <View style={styles.recommendations}>{recommendations.length > 0 ? recommendations.map((item, index) => <View key={item.courseCode} style={[styles.recommendation, { backgroundColor: theme.surface }]}><Text style={[styles.recommendationRank, { color: theme.gold }]}>{index + 1}</Text><View style={styles.recommendationCopy}><Text style={[styles.recommendationCode, { color: theme.green700 }]}>{item.courseCode}</Text><Text style={[styles.recommendationReason, { color: theme.muted }]}>{item.reason}</Text></View></View>) : <Text style={[styles.noRecommendation, { color: theme.muted }]}>Add the next term or complete more prerequisites to unlock a strictly valid recommendation.</Text>}</View>}
      </View>}

      <ScrollView scrollEnabled={!draggingKey} style={[styles.poolScroll, draggingKey && styles.poolScrollDragging]} contentContainerStyle={styles.pathList}>
        {chains.map((chain) => { const open = openPathIds.has(chain.id); return <View key={chain.id} style={[styles.pathway, { borderColor: chain.kind === 'prerequisite' ? theme.border : theme.gold, backgroundColor: theme.canvas }]}><Pressable onPress={() => togglePath(chain.id)} style={styles.pathwayHeader}><View style={styles.pathwayCopy}><Text style={[styles.pathwayName, { color: theme.ink }]}>{chain.name}</Text><Text style={[styles.pathwayMeta, { color: theme.muted }]}>{chain.courseCodes.length} courses · starts Y{chain.startYear} T{chain.startTerm}</Text></View><Text style={[styles.pathwayChevron, { color: theme.green700 }]}>{open ? '−' : '+'}</Text></Pressable>{open && <View style={styles.courseList}>{chain.courseCodes.flatMap((code) => { const course = byCode.get(code); return course ? [renderCourse(course, chain.id)] : []; })}</View>}</View>; })}
        {otherCourses.length > 0 && <View style={[styles.pathway, { borderColor: theme.border, backgroundColor: theme.canvas }]}><Pressable onPress={() => togglePath('other')} style={styles.pathwayHeader}><View style={styles.pathwayCopy}><Text style={[styles.pathwayName, { color: theme.ink }]}>Other courses</Text><Text style={[styles.pathwayMeta, { color: theme.muted }]}>{otherCourses.length} standalone or shorter-chain courses</Text></View><Text style={[styles.pathwayChevron, { color: theme.green700 }]}>{openPathIds.has('other') ? '−' : '+'}</Text></Pressable>{openPathIds.has('other') && <View style={styles.courseList}>{otherCourses.map((course) => renderCourse(course, 'other'))}</View>}</View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 430, borderRightWidth: 1, zIndex: 200, elevation: 30 },
  sidebarMobile: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '94%', maxWidth: 430, shadowOpacity: 0.24, shadowRadius: 18, elevation: 30 },
  sidebarDragging: { overflow: 'visible', zIndex: 900, elevation: 90 },
  narrow: { width: 46, alignItems: 'center', paddingVertical: 10, zIndex: 65 },
  narrowMobile: { position: 'absolute', left: 0, top: 12, height: 142, borderTopRightRadius: 13, borderBottomRightRadius: 13 },
  narrowIcon: { fontSize: 19, fontWeight: '900' },
  narrowLabel: { marginTop: 38, width: 120, textAlign: 'center', transform: [{ rotate: '-90deg' }], fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  header: { padding: 15, paddingBottom: 7, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 3, fontSize: 19, fontWeight: '900' },
  close: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, fontWeight: '900' },
  help: { paddingHorizontal: 15, paddingBottom: 10, fontSize: 10, lineHeight: 15 },
  tatakButton: { marginHorizontal: 10, padding: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tatakEyebrow: { fontSize: 6.5, fontWeight: '900', letterSpacing: 0.8 },
  tatakTitle: { marginTop: 2, fontSize: 14, fontWeight: '900' },
  tatakChevron: { fontSize: 17, fontWeight: '900' },
  tatakPanel: { marginHorizontal: 10, marginTop: 6, padding: 9, borderRadius: 13, borderWidth: 1 },
  goalGrid: { flexDirection: 'row', gap: 5 },
  goal: { flex: 1, minHeight: 62, padding: 7, borderRadius: 9, borderWidth: 1 },
  goalIcon: { fontSize: 14, fontWeight: '900' },
  goalName: { marginTop: 5, fontSize: 7.5, lineHeight: 10, fontWeight: '900' },
  recommendations: { marginTop: 8, gap: 5 },
  recommendation: { padding: 7, borderRadius: 9, flexDirection: 'row' },
  recommendationRank: { width: 20, fontSize: 13, fontWeight: '900' },
  recommendationCopy: { flex: 1 },
  recommendationCode: { fontSize: 9, fontWeight: '900' },
  recommendationReason: { marginTop: 2, fontSize: 7.5, lineHeight: 10 },
  noRecommendation: { padding: 6, fontSize: 8, lineHeight: 12 },
  poolScroll: { flex: 1 },
  poolScrollDragging: { overflow: 'visible' },
  pathList: { padding: 10, paddingBottom: 30, overflow: 'visible' },
  pathway: { marginBottom: 7, borderRadius: 12, borderWidth: 1, overflow: 'visible' },
  pathwayHeader: { minHeight: 55, padding: 10, flexDirection: 'row', alignItems: 'center' },
  pathwayCopy: { flex: 1 },
  pathwayName: { fontSize: 10.5, fontWeight: '900' },
  pathwayMeta: { marginTop: 3, fontSize: 7.5, fontWeight: '700' },
  pathwayChevron: { width: 22, textAlign: 'center', fontSize: 16, fontWeight: '900' },
  courseList: { padding: 7, paddingTop: 0, gap: 7, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', overflow: 'visible' },
  courseSlot: { width: '49%', minWidth: 0, position: 'relative' },
  draggingSlot: { zIndex: 9999, elevation: 999 },
  courseTile: { minHeight: 82, padding: 9, borderRadius: 10, borderWidth: 1, borderLeftWidth: 4 },
  lockedTile: { opacity: 0.60 },
  draggingTile: { zIndex: 9999, elevation: 999, shadowOpacity: 0.38, shadowRadius: 16 },
  courseTop: { flexDirection: 'row', justifyContent: 'space-between' },
  courseCode: { fontSize: 9.5, fontWeight: '900' },
  units: { fontSize: 8, fontWeight: '800' },
  courseTitle: { marginTop: 3, fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  courseBottom: { marginTop: 7, flexDirection: 'row', alignItems: 'center' },
  status: { flex: 1, fontSize: 7, fontWeight: '900', letterSpacing: 0.4 },
  dragHandle: { width: 29, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dragIcon: { fontSize: 16, fontWeight: '900' },
});
