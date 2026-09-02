import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { Course, CourseStatus, RetakeAttempt, StudentWorkspace } from '../types';
import { dependentCourseCodes, termGwa, updateCourseBundleStatus, updateCourseGrade, updateRetakeAttempt } from '../domain/planner';
import { courseBundleCodes, visibleCurriculumCourses } from '../domain/academicSetup';
import { CourseFilter, courseDepartment, courseFilters } from '../domain/coursePresentation';
import { CourseDetailsModal } from './CourseDetailsModal';

const statusOrder: Record<CourseStatus, number> = { active: 0, retake: 1, pending: 2, passed: 3 };
const nextStatus = (status: CourseStatus): CourseStatus => status === 'pending' ? 'active' : status === 'active' ? 'passed' : status === 'retake' ? 'active' : 'pending';

export function ProgressScreen({ workspace, onChange }: { workspace: StudentWorkspace; onChange: (workspace: StudentWorkspace) => void }) {
  const theme = useAppTheme();
  const curriculum = workspace.curriculum;
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<CourseFilter>('ALL');
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const [showGrades, setShowGrades] = useState(false);
  const [gradeTermId, setGradeTermId] = useState(workspace.academicProfile?.currentTermId ?? '');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  if (!curriculum) return null;

  const visible = visibleCurriculumCourses(curriculum);
  const normalized = query.trim().toLowerCase();
  const courses = visible.filter((course) =>
    (department === 'ALL' || courseDepartment(course.code) === department) &&
    (!normalized || course.code.toLowerCase().includes(normalized) || course.title.toLowerCase().includes(normalized)),
  ).sort((a, b) => {
    const aTerm = curriculum.terms.find((term) => term.id === a.originalTermId)?.order ?? 999;
    const bTerm = curriculum.terms.find((term) => term.id === b.originalTermId)?.order ?? 999;
    return aTerm - bTerm || statusOrder[workspace.statuses[a.code] ?? 'pending'] - statusOrder[workspace.statuses[b.code] ?? 'pending'];
  });
  const years = [...new Set(courses.map((course) => curriculum.terms.find((term) => term.id === course.originalTermId)?.year).filter((year): year is number => Boolean(year)))];
  const passedUnits = curriculum.courses.reduce((total, course) => total + (workspace.statuses[course.code] === 'passed' ? course.units : 0), 0);
  const totalUnits = curriculum.courses.reduce((total, course) => total + course.units, 0);
  const selectedStatus = selectedCourse ? workspace.statuses[selectedCourse.code] ?? 'pending' : 'pending';
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));

  const toggleYear = (year: number) => setCollapsedYears((current) => {
    const next = new Set(current);
    next.has(year) ? next.delete(year) : next.add(year);
    return next;
  });

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.canvas }]}> 
      <Text style={[styles.eyebrow, { color: theme.green700 }]}>PROGRESS & GRADES</Text>
      <Text style={[styles.title, { color: theme.ink }]}>Keep your academic record current</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Tap a course tile to move it through Pending, Active, and Passed. Use the info button or long-press for complete details.</Text>

      <View style={[styles.progressCard, { backgroundColor: theme.green900 }]}> 
        <View style={styles.progressCopy}><Text style={[styles.progressValue, { color: contrastText(theme.green900) }]}>{passedUnits}</Text><Text style={[styles.progressLabel, { color: contrastText(theme.green900) }]}>of {totalUnits} units passed</Text></View>
        <Text style={[styles.progressPercent, { color: theme.gold }]}>{Math.round((passedUnits / Math.max(totalUnits, 1)) * 100)}%</Text>
        <View style={[styles.track, { backgroundColor: theme.green800 }]}><View style={[styles.fill, { width: `${(passedUnits / Math.max(totalUnits, 1)) * 100}%`, backgroundColor: theme.gold }]} /></View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeadingCopy}><Text style={[styles.gwaHeading, { color: theme.ink }]}>Trimester GWA</Text><Text style={[styles.gwaHelper, { color: theme.muted }]}>Calculated from individual 0–100 grades and weighted by units. Blank grades are excluded.</Text></View>
        <Pressable onPress={() => setShowGrades((value) => !value)} style={[styles.gradeButton, { backgroundColor: theme.gold }]}><Text style={[styles.gradeButtonText, { color: theme.green900 }]}>{showGrades ? 'Close gradebook' : 'Enter grades'}</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gwaGrid}>
        {curriculum.terms.map((term) => {
          const gwa = termGwa(workspace, term.id);
          return (
            <Pressable key={term.id} onPress={() => { setGradeTermId(term.id); setShowGrades(true); }} style={[styles.gwaCard, { backgroundColor: theme.surface, borderColor: gradeTermId === term.id && showGrades ? theme.green700 : theme.border }]}> 
              <Text style={[styles.gwaTerm, { color: theme.muted }]}>Y{term.year} · T{term.term}</Text>
              <Text style={[styles.gwaValue, { color: theme.green700 }, gwa === null && styles.gwaEmpty]}>{gwa === null ? '—' : gwa.toFixed(2)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {showGrades && <GradeBook workspace={workspace} onChange={onChange} termId={gradeTermId || workspace.academicProfile?.currentTermId || curriculum.terms[0]?.id} onTermChange={setGradeTermId} />}

      <View style={styles.filterRow}>
        <View style={[styles.departmentTabs, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          {courseFilters.map((item) => {
            const count = item === 'ALL' ? visible.length : visible.filter((course) => courseDepartment(course.code) === item).length;
            return <Pressable key={item} onPress={() => setDepartment(item)} style={[styles.departmentTab, department === item && { backgroundColor: theme.green900 }]}><Text style={[styles.departmentText, { color: department === item ? contrastText(theme.green900) : theme.muted }]}>{item === 'ALL' ? 'All' : item} · {count}</Text></Pressable>;
          })}
        </View>
        <View style={styles.collapseActions}>
          <Pressable onPress={() => setCollapsedYears(new Set(years))} style={[styles.smallAction, { backgroundColor: theme.surface }]}><Text style={[styles.smallActionText, { color: theme.ink }]}>Collapse all</Text></Pressable>
          <Pressable onPress={() => setCollapsedYears(new Set())} style={[styles.smallAction, { backgroundColor: theme.surface }]}><Text style={[styles.smallActionText, { color: theme.ink }]}>Expand all</Text></Pressable>
        </View>
      </View>

      <TextInput value={query} onChangeText={setQuery} placeholder={department === 'ALL' ? 'Search all courses' : `Search ${department} courses`} placeholderTextColor={theme.muted} style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink }]} />

      {years.map((year) => {
        const yearCourses = courses.filter((course) => curriculum.terms.find((term) => term.id === course.originalTermId)?.year === year);
        const passed = yearCourses.filter((course) => workspace.statuses[course.code] === 'passed').length;
        const collapsed = collapsedYears.has(year);
        return (
          <View key={year} style={[styles.yearGroup, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Pressable onPress={() => toggleYear(year)} style={[styles.yearHeader, passed === yearCourses.length && yearCourses.length > 0 && { backgroundColor: theme.green100 }]}>
              <View><Text style={[styles.yearTitle, { color: theme.ink }]}>{passed === yearCourses.length && yearCourses.length > 0 ? '✓ ' : ''}Year {year}</Text><Text style={[styles.yearMeta, { color: theme.muted }]}>{passed} of {yearCourses.length} passed</Text></View>
              <Text style={[styles.chevron, { color: theme.green700 }]}>{collapsed ? '＋' : '−'}</Text>
            </Pressable>
            {!collapsed && curriculum.terms.filter((term) => term.year === year).map((term) => {
              const termCourses = yearCourses.filter((course) => course.originalTermId === term.id);
              if (termCourses.length === 0) return null;
              return (
                <View key={term.id} style={[styles.termGroup, { borderTopColor: theme.border }]}> 
                  <Text style={[styles.termTitle, { color: theme.muted }]}>TERM {term.term}</Text>
                  <View style={styles.courseGrid}>
                    {termCourses.map((course) => (
                      <ProgressTile key={course.code} course={course} status={workspace.statuses[course.code] ?? 'pending'} onCycle={() => onChange(updateCourseBundleStatus(workspace, course.code, nextStatus(workspace.statuses[course.code] ?? 'pending')))} onDetails={() => setSelectedCourse(course)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      <CourseDetailsModal
        course={selectedCourse}
        status={selectedStatus}
        terms={curriculum.terms}
        currentTermId={selectedCourse ? workspace.plan[selectedCourse.code] ?? selectedCourse.originalTermId : ''}
        visible={Boolean(selectedCourse)}
        onClose={() => setSelectedCourse(null)}
        onStatusChange={(status) => selectedCourse && onChange(updateCourseBundleStatus(workspace, selectedCourse.code, status))}
        gradeEntries={selectedCourse ? courseBundleCodes(curriculum, selectedCourse.code).map((code) => ({ code, title: byCode.get(code)?.title ?? code, units: byCode.get(code)?.units ?? 0, value: workspace.grades?.[code] })) : []}
        onGradeChange={(code, grade) => onChange(updateCourseGrade(workspace, code, grade))}
        onMove={() => undefined}
        allowMove={false}
        dependentCodes={selectedCourse ? dependentCourseCodes(curriculum, selectedCourse.code) : []}
      />
    </ScrollView>
  );
}

function ProgressTile({ course, status, onCycle, onDetails }: { course: Course; status: CourseStatus; onCycle: () => void; onDetails: () => void }) {
  const theme = useAppTheme();
  const label = status === 'passed' ? '✓ PASSED' : status === 'active' ? '● ACTIVE' : status === 'retake' ? '↻ RETAKE' : 'PENDING';
  const accent = status === 'passed' || status === 'active' ? theme.green700 : status === 'retake' ? theme.danger : theme.muted;
  return (
    <Pressable onPress={onCycle} onLongPress={onDetails} delayLongPress={420} style={({ pressed }) => [styles.progressTile, { backgroundColor: status === 'passed' || status === 'active' ? theme.green100 : theme.canvas, borderColor: accent }, pressed && styles.pressed]}> 
      <View style={styles.tileTop}><Text style={[styles.code, { color: accent }]}>{course.code}</Text><Pressable onPress={(event) => { event.stopPropagation(); onDetails(); }} style={[styles.info, { backgroundColor: theme.surface }]}><Text style={[styles.infoText, { color: theme.green700 }]}>i</Text></Pressable></View>
      <Text numberOfLines={2} style={[styles.courseTitle, { color: theme.ink }]}>{course.title}</Text>
      <Text style={[styles.statusLabel, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

function GradeBook({ workspace, onChange, termId, onTermChange }: { workspace: StudentWorkspace; onChange: (workspace: StudentWorkspace) => void; termId: string; onTermChange: (termId: string) => void }) {
  const theme = useAppTheme();
  const curriculum = workspace.curriculum;
  if (!curriculum) return null;
  const byCode = new Map(curriculum.courses.map((course) => [course.code, course]));
  const termCourses = visibleCurriculumCourses(curriculum).filter((course) => (workspace.plan[course.code] ?? course.originalTermId) === termId);
  const attempts = (workspace.retakeAttempts ?? []).filter((attempt) => attempt.termId === termId);
  return (
    <View style={[styles.gradeBook, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.termTabs}>
        {curriculum.terms.map((term) => <Pressable key={term.id} onPress={() => onTermChange(term.id)} style={[styles.termTab, { backgroundColor: term.id === termId ? theme.green900 : theme.canvas }]}><Text style={[styles.termTabText, { color: term.id === termId ? contrastText(theme.green900) : theme.muted }]}>Y{term.year} · T{term.term}</Text></Pressable>)}
      </ScrollView>
      <Text style={[styles.gradeBookTitle, { color: theme.ink }]}>Individual course grades</Text>
      <Text style={[styles.gradeBookHelp, { color: theme.muted }]}>Enter values from 0 to 100. Changes save when the field loses focus or you press Enter.</Text>
      {termCourses.flatMap((course) => courseBundleCodes(curriculum, course.code).map((code) => (
        <InlineGrade key={`base-${code}`} label={code} title={byCode.get(code)?.title ?? code} value={workspace.grades?.[code]} onSave={(grade) => onChange(updateCourseGrade(workspace, code, grade))} />
      )))}
      {attempts.flatMap((attempt) => courseBundleCodes(curriculum, attempt.courseCode).map((code) => (
        <InlineGrade key={`${attempt.id}-${code}`} label={`${code} · Retake`} title={byCode.get(code)?.title ?? code} value={attempt.grades[code]} onSave={(grade) => onChange(updateRetakeAttempt(workspace, attempt.id, { gradeCode: code, grade }))} />
      )))}
      {termCourses.length === 0 && attempts.length === 0 && <Text style={[styles.noGrades, { color: theme.muted }]}>No planned courses in this trimester.</Text>}
    </View>
  );
}

function InlineGrade({ label, title, value, onSave }: { label: string; title: string; value?: number; onSave: (grade?: number) => void }) {
  const theme = useAppTheme();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [error, setError] = useState(false);
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const save = () => {
    if (!text.trim()) { setError(false); onSave(undefined); return; }
    const grade = Number(text.trim().replace(',', '.'));
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) { setError(true); return; }
    setError(false);
    onSave(grade);
  };
  return (
    <View style={[styles.gradeRow, { backgroundColor: theme.canvas, borderColor: error ? theme.danger : theme.border }]}> 
      <View style={styles.gradeCopy}><Text style={[styles.gradeCode, { color: theme.green700 }]}>{label}</Text><Text numberOfLines={1} style={[styles.gradeTitle, { color: theme.muted }]}>{title}</Text></View>
      <TextInput value={text} onChangeText={setText} onBlur={save} onSubmitEditing={save} keyboardType="decimal-pad" placeholder="Grade" placeholderTextColor={theme.muted} style={[styles.gradeInput, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border, color: theme.ink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 110 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, fontSize: 27, fontWeight: '900' },
  subtitle: { marginTop: 6, lineHeight: 20, fontSize: 12 },
  progressCard: { marginTop: 18, padding: 18, borderRadius: 19 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline' },
  progressValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  progressLabel: { color: '#B7D4C6', marginLeft: 7, fontSize: 12 },
  progressPercent: { position: 'absolute', right: 18, top: 23, color: colors.gold, fontWeight: '900' },
  track: { marginTop: 13, height: 7, backgroundColor: '#315E4C', borderRadius: 6, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 6 },
  sectionHeadingRow: { marginTop: 21, flexDirection: 'row', alignItems: 'center' },
  sectionHeadingCopy: { flex: 1, paddingRight: 10 },
  gwaHeading: { fontSize: 18, fontWeight: '900' },
  gwaHelper: { marginTop: 4, fontSize: 11, lineHeight: 17 },
  gradeButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11 },
  gradeButtonText: { fontSize: 10, fontWeight: '900' },
  gwaGrid: { paddingVertical: 11, gap: 7 },
  gwaCard: { width: 86, padding: 10, borderRadius: 12, borderWidth: 1 },
  gwaTerm: { fontSize: 9, fontWeight: '800' },
  gwaValue: { marginTop: 4, fontSize: 16, fontWeight: '900' },
  gwaEmpty: { color: '#9CA7A1' },
  gradeBook: { marginBottom: 18, padding: 14, borderRadius: 17, borderWidth: 1 },
  termTabs: { gap: 6, paddingBottom: 11 },
  termTab: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9 },
  termTabText: { fontSize: 9, fontWeight: '900' },
  gradeBookTitle: { fontSize: 16, fontWeight: '900' },
  gradeBookHelp: { marginTop: 3, marginBottom: 10, fontSize: 10, lineHeight: 15 },
  gradeRow: { minHeight: 59, marginBottom: 7, padding: 9, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  gradeCopy: { flex: 1, marginRight: 9 },
  gradeCode: { fontSize: 10, fontWeight: '900' },
  gradeTitle: { marginTop: 2, fontSize: 9 },
  gradeInput: { width: 78, height: 40, borderRadius: 9, borderWidth: 1, textAlign: 'center', fontWeight: '900' },
  noGrades: { paddingVertical: 14, textAlign: 'center', fontSize: 11 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  departmentTabs: { flex: 1, maxWidth: 470, padding: 4, borderRadius: 14, borderWidth: 1, flexDirection: 'row' },
  departmentTab: { flex: 1, minHeight: 39, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  departmentText: { fontSize: 10, fontWeight: '900' },
  collapseActions: { flexDirection: 'row', gap: 5 },
  smallAction: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9 },
  smallActionText: { fontSize: 9, fontWeight: '900' },
  search: { marginTop: 12, height: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  yearGroup: { marginTop: 13, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  yearHeader: { minHeight: 62, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearTitle: { fontSize: 16, fontWeight: '900' },
  yearMeta: { marginTop: 2, fontSize: 10, fontWeight: '700' },
  chevron: { fontSize: 18, fontWeight: '900' },
  termGroup: { padding: 12, borderTopWidth: 1 },
  termTitle: { marginBottom: 8, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  courseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressTile: { width: 220, minHeight: 112, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  tileTop: { flexDirection: 'row', alignItems: 'center' },
  code: { flex: 1, fontSize: 11, fontWeight: '900' },
  info: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 12, fontWeight: '900' },
  courseTitle: { marginTop: 7, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  statusLabel: { marginTop: 'auto', paddingTop: 9, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
});
