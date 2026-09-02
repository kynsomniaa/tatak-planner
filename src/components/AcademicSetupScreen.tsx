import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { contrastText, useAppTheme } from '../theme';
import { Course, CourseStatus, Curriculum, StudentWorkspace } from '../types';
import {
  courseBundleCodes,
  createWorkspaceFromProgress,
  inferPrerequisiteCodes,
  visibleCurriculumCourses,
} from '../domain/academicSetup';
import { CourseFilter, courseDepartment, courseFilters } from '../domain/coursePresentation';
import { PrimaryButton } from './ui';

interface PendingDecision {
  label: string;
  targetCodes: string[];
  missingCodes: string[];
}

const nextStatus = (status: CourseStatus): CourseStatus =>
  status === 'pending' ? 'active' : status === 'active' ? 'passed' : status === 'passed' ? 'retake' : 'pending';

export function AcademicSetupScreen({ curriculum, onBack, onComplete }: {
  curriculum: Curriculum;
  onBack: () => void;
  onComplete: (workspace: StudentWorkspace) => void;
}) {
  const theme = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const yearColumns = windowWidth >= 1100 ? 3 : windowWidth >= 700 ? 2 : 1;
  const [currentTermId, setCurrentTermId] = useState(curriculum.terms[0].id);
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()));
  const [startTerm, setStartTerm] = useState(1);
  const parsedStartYear = Number.parseInt(startYear, 10);
  const validStartYear = Number.isInteger(parsedStartYear) && parsedStartYear >= 2000 && parsedStartYear <= 2100;
  const [statuses, setStatuses] = useState<Record<string, CourseStatus>>(
    Object.fromEntries(curriculum.courses.map((course) => [course.code, 'pending'])),
  );
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [department, setDepartment] = useState<CourseFilter>('ALL');
  const [query, setQuery] = useState('');
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const visibleCourses = useMemo(() => visibleCurriculumCourses(curriculum), [curriculum]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCourses = visibleCourses.filter((course) =>
    (department === 'ALL' || courseDepartment(course.code) === department)
    && (!normalizedQuery || course.code.toLowerCase().includes(normalizedQuery) || course.title.toLowerCase().includes(normalizedQuery)),
  );
  const years = [...new Set(curriculum.terms.map((term) => term.year))]
    .filter((year) => filteredCourses.some((course) => curriculum.terms.find((term) => term.id === course.originalTermId)?.year === year));

  const setCourseBundleStatus = (courseCode: string, status: CourseStatus) => {
    setStatuses((current) => ({
      ...current,
      ...Object.fromEntries(courseBundleCodes(curriculum, courseCode).map((code) => [code, status])),
    }));
  };

  const passTargets = (targetCodes: string[], includeRequirements: boolean) => {
    const missing = [...new Set(targetCodes.flatMap((code) =>
      inferPrerequisiteCodes(curriculum, [code]).filter((prerequisiteCode) => statuses[prerequisiteCode] !== 'passed'),
    ))];
    setStatuses((current) => {
      const next = { ...current };
      targetCodes.flatMap((code) => courseBundleCodes(curriculum, code)).forEach((code) => { next[code] = 'passed'; });
      if (includeRequirements) missing.forEach((code) => { next[code] = 'passed'; });
      return next;
    });
    if (!includeRequirements && missing.length > 0) {
      setOverrides((current) => ({ ...current, ...Object.fromEntries(targetCodes.map((code) => [code, missing])) }));
    }
    setPendingDecision(null);
  };

  const requestPass = (label: string, targetCodes: string[]) => {
    const targetBundles = new Set(targetCodes.flatMap((code) => courseBundleCodes(curriculum, code)));
    const missing = [...new Set(targetCodes.flatMap((code) =>
      inferPrerequisiteCodes(curriculum, [code]).filter((code) => !targetBundles.has(code) && statuses[code] !== 'passed'),
    ))];
    if (missing.length === 0) passTargets(targetCodes, false);
    else setPendingDecision({ label, targetCodes, missingCodes: missing });
  };

  const updateStatus = (course: Course, status: CourseStatus) => {
    if (status === 'passed') requestPass(course.code, [course.code]);
    else {
      setCourseBundleStatus(course.code, status);
      if (status === 'active') {
        setStatuses((current) => {
          const next = { ...current };
          course.corequisites
            .filter((code) => !course.linkedLaboratories.includes(code) && current[code] !== 'passed')
            .forEach((code) => { next[code] = 'active'; });
          return next;
        });
      }
    }
  };

  const toggleGroupPassed = (label: string, courses: Course[]) => {
    const allPassed = courses.every((course) => courseBundleCodes(curriculum, course.code).every((code) => statuses[code] === 'passed'));
    if (allPassed) courses.forEach((course) => setCourseBundleStatus(course.code, 'pending'));
    else requestPass(label, courses.map((course) => course.code));
  };

  const toggleYear = (year: number) => setCollapsedYears((current) => {
    const next = new Set(current);
    next.has(year) ? next.delete(year) : next.add(year);
    return next;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}> 
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={onBack} style={styles.backButton}><Text style={[styles.backText, { color: theme.green700 }]}>← Back to curriculum file</Text></Pressable>
        <View style={[styles.step, { backgroundColor: theme.green100 }]}><Text style={[styles.stepText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>2 OF 2</Text></View>
        <Text style={[styles.title, { color: theme.ink }]}>Set up your academic progress</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>A compact course view grouped by year and term. Tap a tile to cycle Pending → Active → Passed → Retake.</Text>

        <View style={[styles.currentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <View style={styles.startRow}>
            <View style={styles.startField}><Text style={[styles.label, { color: theme.muted }]}>YEAR STARTED</Text><TextInput value={startYear} onChangeText={(value) => setStartYear(value.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="2024" placeholderTextColor={theme.muted} style={[styles.yearInput, { backgroundColor: theme.canvas, borderColor: validStartYear ? theme.border : theme.danger, color: theme.ink }]} /></View>
            <View style={styles.startField}><Text style={[styles.label, { color: theme.muted }]}>STARTING TRIMESTER</Text><View style={styles.startTermRow}>{[1, 2, 3].map((term) => <Pressable key={term} onPress={() => setStartTerm(term)} style={[styles.startTerm, { backgroundColor: startTerm === term ? theme.green800 : theme.canvas, borderColor: startTerm === term ? theme.green800 : theme.border }]}><Text style={[styles.startTermText, { color: startTerm === term ? contrastText(theme.green800) : theme.ink }]}>T{term}</Text></Pressable>)}</View></View>
          </View>
          <Text style={[styles.label, { color: theme.muted }]}>YOUR CURRENT TERM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.termChips}>
            {curriculum.terms.map((term) => {
              const active = currentTermId === term.id;
              return <Pressable key={term.id} onPress={() => setCurrentTermId(term.id)} style={[styles.termChip, { backgroundColor: active ? theme.green800 : theme.canvas, borderColor: active ? theme.green800 : theme.border }]}><Text style={[styles.termChipText, { color: active ? contrastText(theme.green800) : theme.ink }]}>Y{term.year} · T{term.term}</Text></Pressable>;
            })}
          </ScrollView>
        </View>

        {pendingDecision && (
          <View style={[styles.warningCard, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}> 
            <Text style={[styles.warningTitle, { color: theme.warning }]}>Prerequisites are not marked passed</Text>
            <Text style={[styles.warningBody, { color: theme.ink }]}>{pendingDecision.label} requires: {pendingDecision.missingCodes.join(', ')}.</Text>
            <PrimaryButton label="Mark prerequisites passed" onPress={() => passTargets(pendingDecision.targetCodes, true)} style={styles.warningButton} />
            <PrimaryButton label="Continue and keep warning" tone="light" onPress={() => passTargets(pendingDecision.targetCodes, false)} style={styles.warningButton} />
            <Pressable onPress={() => setPendingDecision(null)} style={styles.cancelWarning}><Text style={[styles.cancelWarningText, { color: theme.danger }]}>Cancel</Text></Pressable>
          </View>
        )}

        <View style={styles.filterHeading}>
          <View><Text style={[styles.sectionTitle, { color: theme.ink }]}>Courses</Text><Text style={[styles.sectionHelp, { color: theme.muted }]}>{filteredCourses.length} of {visibleCourses.length} visible</Text></View>
          <View style={styles.collapseActions}>
            <Pressable onPress={() => setCollapsedYears(new Set(years))} style={[styles.smallAction, { backgroundColor: theme.surface }]}><Text style={[styles.smallActionText, { color: theme.ink }]}>Collapse all</Text></Pressable>
            <Pressable onPress={() => setCollapsedYears(new Set())} style={[styles.smallAction, { backgroundColor: theme.surface }]}><Text style={[styles.smallActionText, { color: theme.ink }]}>Expand all</Text></Pressable>
          </View>
        </View>
        <View style={[styles.departmentTabs, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          {courseFilters.map((filter) => {
            const active = department === filter;
            const count = filter === 'ALL' ? visibleCourses.length : visibleCourses.filter((course) => courseDepartment(course.code) === filter).length;
            return <Pressable key={filter} onPress={() => setDepartment(filter)} style={[styles.departmentTab, active && { backgroundColor: theme.green900 }]}><Text style={[styles.departmentText, { color: active ? contrastText(theme.green900) : theme.muted }]}>{filter === 'ALL' ? 'All' : filter} · {count}</Text></Pressable>;
          })}
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search course code or title" placeholderTextColor={theme.muted} style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink }]} />

        <View style={styles.yearGrid}>{years.map((year) => {
          const yearTerms = curriculum.terms.filter((term) => term.year === year);
          const allYearCourses = visibleCourses.filter((course) => yearTerms.some((term) => term.id === course.originalTermId));
          const shownYearCourses = filteredCourses.filter((course) => yearTerms.some((term) => term.id === course.originalTermId));
          const passedCount = allYearCourses.filter((course) => statuses[course.code] === 'passed').length;
          const yearPassed = allYearCourses.length > 0 && passedCount === allYearCourses.length;
          const collapsed = collapsedYears.has(year);
          return (
            <View key={year} style={[styles.yearSection, { width: yearColumns === 3 ? '32%' : yearColumns === 2 ? '49%' : '100%', backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <Pressable onPress={() => toggleYear(year)} style={[styles.yearHeader, { backgroundColor: yearPassed ? theme.green100 : theme.surface }]}> 
                <View><Text style={[styles.yearTitle, { color: theme.ink }]}>{yearPassed ? '✓ ' : ''}Year {year}</Text><Text style={[styles.yearMeta, { color: theme.muted }]}>{passedCount} of {allYearCourses.length} passed · {shownYearCourses.length} shown</Text></View>
                <View style={styles.yearActions}>
                  <Pressable onPress={(event) => { event.stopPropagation(); toggleGroupPassed(`Year ${year}`, allYearCourses); }} style={[styles.groupCheck, { backgroundColor: yearPassed ? theme.gold : theme.canvas }]}><Text style={[styles.groupCheckText, { color: yearPassed ? contrastText(theme.gold) : theme.ink }]}>{yearPassed ? 'Undo year' : 'Mark year done'}</Text></Pressable>
                  <Text style={[styles.chevron, { color: theme.green700 }]}>{collapsed ? '＋' : '−'}</Text>
                </View>
              </Pressable>

              {!collapsed && yearTerms.map((term) => {
                const allTermCourses = allYearCourses.filter((course) => course.originalTermId === term.id);
                const termCourses = shownYearCourses.filter((course) => course.originalTermId === term.id);
                if (termCourses.length === 0) return null;
                const termPassed = allTermCourses.length > 0 && allTermCourses.every((course) => statuses[course.code] === 'passed');
                return (
                  <View key={term.id} style={[styles.termSection, { borderTopColor: theme.border }]}> 
                    <View style={styles.termHeader}>
                      <Text style={[styles.termTitle, { color: theme.ink }]}>Term {term.term}</Text>
                      <Pressable onPress={() => toggleGroupPassed(`Year ${year}, Term ${term.term}`, allTermCourses)} style={[styles.termCheck, { backgroundColor: termPassed ? theme.green100 : theme.canvas, borderColor: termPassed ? theme.green700 : theme.border }]}><Text style={[styles.termCheckText, { color: termPassed ? contrastText(theme.green100, '#FFFFFF', theme.green900) : theme.muted }]}>{termPassed ? '✓ All done' : 'Mark term done'}</Text></Pressable>
                    </View>
                    <View style={styles.courseGrid}>
                      {termCourses.map((course) => <SetupCourseTile key={course.code} course={course} status={statuses[course.code] ?? 'pending'} onPress={() => updateStatus(course, nextStatus(statuses[course.code] ?? 'pending'))} />)}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}</View>

        <PrimaryButton label="Create my personal planner" disabled={Boolean(pendingDecision) || !validStartYear} onPress={() => onComplete(createWorkspaceFromProgress(curriculum, currentTermId, statuses, overrides, parsedStartYear, startTerm))} style={styles.completeButton} />
        <Text style={[styles.privacy, { color: theme.muted }]}>Grades are added later from Progress or course details. Your private plan is saved to your account.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SetupCourseTile({ course, status, onPress }: { course: Course; status: CourseStatus; onPress: () => void }) {
  const theme = useAppTheme();
  const department = courseDepartment(course.code);
  const departmentAccent = department === 'CPE' ? theme.green700 : department === 'COE' ? theme.gold : theme.green800;
  const accent = status === 'passed' || status === 'active' ? theme.green700 : status === 'retake' ? theme.danger : theme.muted;
  const label = status === 'passed' ? '✓ PASSED' : status === 'active' ? '● ACTIVE' : status === 'retake' ? '↻ RETAKE' : 'PENDING';
  const extraCorequisites = course.corequisites.filter((code) => !course.linkedLaboratories.includes(code));
  return (
    <Pressable accessibilityLabel={`${course.code}, ${label}. Tap to change status.`} onPress={onPress} style={({ pressed }) => [styles.courseTile, { backgroundColor: status === 'passed' || status === 'active' ? theme.green100 : theme.canvas, borderColor: departmentAccent }, pressed && styles.pressed]}> 
      <View style={styles.tileTop}><View style={styles.codeGroup}><View style={[styles.departmentDot, { backgroundColor: departmentAccent }]} /><Text style={[styles.courseCode, { color: departmentAccent }]}>{course.code}</Text></View><Text style={[styles.units, { color: theme.muted }]}>{course.units}u</Text></View>
      <Text numberOfLines={2} style={[styles.courseTitle, { color: theme.ink }]}>{course.title}</Text>
      <View style={styles.indicators}>{course.linkedLaboratories.length > 0 && <Text style={[styles.lab, { color: theme.blue }]}>+ LAB</Text>}{extraCorequisites.length > 0 && <Text style={[styles.corequisite, { color: theme.warning }]}>CO-REQ {extraCorequisites.join(', ')}</Text>}</View>
      <Text style={[styles.statusLabel, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { padding: 20, paddingBottom: 48 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 7 },
  backText: { fontSize: 12, fontWeight: '800' },
  step: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  stepText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  title: { marginTop: 16, fontSize: 29, lineHeight: 35, fontWeight: '900' },
  subtitle: { marginTop: 9, fontSize: 13, lineHeight: 21 },
  currentCard: { marginTop: 18, padding: 14, borderRadius: 16, borderWidth: 1 },
  startRow: { marginBottom: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  startField: { flex: 1, minWidth: 190 },
  yearInput: { marginTop: 7, height: 41, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, fontSize: 12, fontWeight: '800' },
  startTermRow: { marginTop: 7, flexDirection: 'row', gap: 6 },
  startTerm: { flex: 1, height: 41, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  startTermText: { fontSize: 10, fontWeight: '900' },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  termChips: { paddingTop: 10, gap: 7 },
  termChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, borderWidth: 1 },
  termChipText: { fontSize: 10, fontWeight: '800' },
  warningCard: { marginTop: 15, padding: 16, borderRadius: 16, borderWidth: 1 },
  warningTitle: { fontSize: 15, fontWeight: '900' },
  warningBody: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  warningButton: { marginTop: 9 },
  cancelWarning: { alignItems: 'center', paddingVertical: 12 },
  cancelWarningText: { fontWeight: '800' },
  filterHeading: { marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  sectionHelp: { marginTop: 2, fontSize: 10 },
  collapseActions: { flexDirection: 'row', gap: 6 },
  smallAction: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  smallActionText: { fontSize: 9, fontWeight: '800' },
  departmentTabs: { marginTop: 10, padding: 4, borderRadius: 13, borderWidth: 1, flexDirection: 'row' },
  departmentTab: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  departmentText: { fontSize: 9, fontWeight: '900' },
  search: { marginTop: 9, height: 46, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1 },
  yearGrid: { marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  yearSection: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  yearHeader: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearTitle: { fontSize: 18, fontWeight: '900' },
  yearMeta: { marginTop: 3, fontSize: 9, fontWeight: '700' },
  yearActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupCheck: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  groupCheckText: { fontSize: 8, fontWeight: '900' },
  chevron: { width: 20, textAlign: 'center', fontSize: 16, fontWeight: '900' },
  termSection: { padding: 12, borderTopWidth: 1 },
  termHeader: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  termTitle: { fontSize: 13, fontWeight: '900' },
  termCheck: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  termCheckText: { fontSize: 8, fontWeight: '900' },
  courseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  courseTile: { minWidth: 118, flexBasis: '46%', flexGrow: 1, minHeight: 112, padding: 10, borderRadius: 12, borderWidth: 1, borderLeftWidth: 4 },
  pressed: { opacity: 0.76 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  codeGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  departmentDot: { width: 7, height: 7, borderRadius: 4 },
  courseCode: { fontSize: 10, fontWeight: '900' },
  units: { fontSize: 8, fontWeight: '800' },
  courseTitle: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  indicators: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  lab: { fontSize: 7, fontWeight: '900' },
  corequisite: { fontSize: 7, fontWeight: '900' },
  statusLabel: { marginTop: 'auto', paddingTop: 7, fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  completeButton: { marginTop: 24 },
  privacy: { marginTop: 12, textAlign: 'center', fontSize: 10, lineHeight: 16 },
});
