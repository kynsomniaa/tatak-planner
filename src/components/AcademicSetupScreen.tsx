import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { contrastText, useAppTheme } from '../theme';
import { Course, CourseStatus, Curriculum, StudentWorkspace } from '../types';
import { createWorkspaceFromProgress, visibleCurriculumCourses } from '../domain/academicSetup';
import { academicCalendarPosition, academicTermLabel, currentCurriculumTerm } from '../domain/academicCalendar';
import { applyBulkPassedChange, applyProgressStatusChange, eligibleCourseCodes, ProgressValidationError } from '../domain/academicProgress';
import { courseDepartment } from '../domain/coursePresentation';
import { PrimaryButton } from './ui';

type SetupStep = { kind: 'enrollment' } | { kind: 'history'; year: number } | { kind: 'current' };
interface VisibleError extends ProgressValidationError { context: string }

export function AcademicSetupScreen({ curriculum, onBack, onComplete }: {
  curriculum: Curriculum;
  onBack: () => void;
  onComplete: (workspace: StudentWorkspace) => void;
}) {
  const theme = useAppTheme();
  const calendarNow = academicCalendarPosition();
  const [startYear, setStartYear] = useState(calendarNow.academicYear);
  const [stepIndex, setStepIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, CourseStatus>>(
    Object.fromEntries(curriculum.courses.map((course) => [course.code, 'pending'])),
  );
  const [error, setError] = useState<VisibleError | null>(null);
  const [currentStepPassedCodes, setCurrentStepPassedCodes] = useState<string[]>([]);
  const visible = useMemo(() => visibleCurriculumCourses(curriculum), [curriculum]);
  const expectedCurrentTerm = currentCurriculumTerm(curriculum, startYear);
  const historyTerms = curriculum.terms.filter((term) => term.order < expectedCurrentTerm.order);
  const historyYears = [...new Set(historyTerms.map((term) => term.year))].sort((a, b) => a - b);
  const steps: SetupStep[] = [{ kind: 'enrollment' }, ...historyYears.map((year) => ({ kind: 'history' as const, year })), { kind: 'current' }];
  const safeStepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeStepIndex];
  const nextStep = steps[safeStepIndex + 1];
  const nextHistoryLabel = nextStep?.kind === 'history' ? `Continue to Year ${nextStep.year} →` : 'Continue to current courses →';
  const totalSteps = steps.length + 1;
  const displayStep = safeStepIndex + 2;

  const goBack = () => {
    setError(null);
    if (safeStepIndex === 0) onBack();
    else setStepIndex(safeStepIndex - 1);
  };
  const goNext = () => {
    setError(null);
    setStepIndex(Math.min(steps.length - 1, safeStepIndex + 1));
  };
  const applyOne = (course: Course, status: CourseStatus, context: string) => {
    const result = applyProgressStatusChange(curriculum, statuses, course.code, status);
    if (!result.ok) {
      if (result.error) setError({ ...result.error, context });
      return;
    }
    setStatuses(result.value);
    if (context === 'current') {
      setCurrentStepPassedCodes((current) => status === 'passed'
        ? [...new Set([...current, course.code])]
        : current.filter((code) => code !== course.code));
    }
    setError(null);
  };
  const passMany = (courses: Course[], context: string) => {
    const result = applyBulkPassedChange(curriculum, statuses, courses.map((course) => course.code));
    if (!result.ok) {
      if (result.error) setError({ ...result.error, context });
      return;
    }
    setStatuses(result.value);
    setError(null);
  };

  const yearOptions = Array.from({ length: 9 }, (_, index) => calendarNow.academicYear - index);
  const progress = Math.round((displayStep / totalSteps) * 100);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}> 
      <View style={[styles.topBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={goBack} style={styles.backButton}><Text style={[styles.backText, { color: theme.green700 }]}>← Back</Text></Pressable>
        <View style={styles.stepCopy}><Text style={[styles.stepText, { color: theme.muted }]}>ACADEMIC SETUP · {displayStep} OF {totalSteps}</Text><View style={[styles.progressTrack, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.green700 }]} /></View></View>
      </View>

      {step.kind === 'enrollment' ? (
        <EnrollmentStep startYear={startYear} options={yearOptions} onSelect={(year) => { setStartYear(year); setError(null); }} onNext={goNext} />
      ) : step.kind === 'history' ? (
        <YearHistoryStep
          curriculum={curriculum}
          year={step.year}
          terms={historyTerms.filter((term) => term.year === step.year)}
          courses={visible}
          statuses={statuses}
          error={error}
          onCourse={(course, status, context) => applyOne(course, status, context)}
          onPassMany={passMany}
          nextLabel={nextHistoryLabel}
          onNext={goNext}
        />
      ) : (
        <CurrentCoursesStep
          curriculum={curriculum}
          currentTermId={expectedCurrentTerm.id}
          startYear={startYear}
          statuses={statuses}
          visibleCourses={visible}
          currentStepPassedCodes={currentStepPassedCodes}
          error={error}
          onCourse={(course, status) => applyOne(course, status, 'current')}
          onComplete={() => onComplete(createWorkspaceFromProgress(curriculum, expectedCurrentTerm.id, statuses, {}, startYear, 1))}
        />
      )}
    </SafeAreaView>
  );
}

function EnrollmentStep({ startYear, options, onSelect, onNext }: { startYear: number; options: number[]; onSelect: (year: number) => void; onNext: () => void }) {
  const theme = useAppTheme();
  return (
    <ScrollView contentContainerStyle={styles.centerPage}>
      <Text style={[styles.eyebrow, { color: theme.green700 }]}>FIRST YEAR OF COLLEGE</Text>
      <Text style={[styles.title, { color: theme.ink }]}>When did you start college?</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>This academic year anchors your expected current term and the Current Raid indicator. It does not assume that every earlier course was completed.</Text>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>ACADEMIC YEAR</Text>
      <View style={styles.yearChoices}>
        {options.map((year) => {
          const selected = year === startYear;
          return <Pressable key={year} onPress={() => onSelect(year)} style={[styles.yearChoice, { backgroundColor: selected ? theme.green900 : theme.surface, borderColor: selected ? theme.green900 : theme.border }]}><Text style={[styles.yearChoiceText, { color: selected ? contrastText(theme.green900) : theme.ink }]}>{year}–{year + 1}</Text>{selected && <Text style={[styles.selectedTick, { color: theme.gold }]}>✓</Text>}</Pressable>;
        })}
      </View>
      <PrimaryButton label="Continue to progress history" onPress={onNext} style={styles.primaryAction} />
    </ScrollView>
  );
}

function YearHistoryStep({ curriculum, year, terms, courses, statuses, error, onCourse, onPassMany, nextLabel, onNext }: {
  curriculum: Curriculum;
  year: number;
  terms: Curriculum['terms'];
  courses: Course[];
  statuses: Record<string, CourseStatus>;
  error: VisibleError | null;
  onCourse: (course: Course, status: CourseStatus, context: string) => void;
  onPassMany: (courses: Course[], context: string) => void;
  nextLabel: string;
  onNext: () => void;
}) {
  const theme = useAppTheme();
  const yearCourses = courses.filter((course) => terms.some((term) => term.id === course.originalTermId));
  const allPassed = yearCourses.length > 0 && yearCourses.every((course) => statuses[course.code] === 'passed');
  return (
    <ScrollView contentContainerStyle={styles.wizardPage}>
      <View style={styles.yearHero}><View><Text style={[styles.eyebrow, { color: theme.green700 }]}>PROGRESS HISTORY</Text><Text style={[styles.title, { color: theme.ink }]}>Year {year}</Text><Text style={[styles.subtitle, { color: theme.muted }]}>Only this academic year is shown. Mark completed terms quickly, or select individual courses.</Text></View><Pressable disabled={allPassed} onPress={() => onPassMany(yearCourses, `year-${year}`)} style={[styles.yearPass, { backgroundColor: allPassed ? theme.green100 : theme.gold, opacity: allPassed ? 0.75 : 1 }]}><Text style={[styles.yearPassText, { color: allPassed ? theme.green700 : contrastText(theme.gold) }]}>{allPassed ? '✓ YEAR CONQUERED' : '✓ PASSED ALL SUBJECTS THIS YEAR'}</Text></Pressable></View>
      {error?.context === `year-${year}` && <ProgressErrorBubble error={error} />}
      <View style={styles.termColumns}>
        {terms.map((term) => {
          const termCourses = yearCourses.filter((course) => course.originalTermId === term.id);
          const termPassed = termCourses.length > 0 && termCourses.every((course) => statuses[course.code] === 'passed');
          const context = `term-${term.id}`;
          return (
            <View key={term.id} style={[styles.termCard, { backgroundColor: theme.surface, borderColor: termPassed ? theme.green700 : theme.border }]}>
              <View style={styles.termHeader}><View><Text style={[styles.termTitle, { color: theme.ink }]}>Term {term.term}</Text><Text style={[styles.termMeta, { color: theme.muted }]}>{termCourses.filter((course) => statuses[course.code] === 'passed').length} of {termCourses.length} passed</Text></View><Pressable disabled={termPassed} onPress={() => onPassMany(termCourses, context)} style={[styles.termPass, { backgroundColor: termPassed ? theme.green100 : theme.canvas, borderColor: termPassed ? theme.green700 : theme.border }]}><Text style={[styles.termPassText, { color: termPassed ? theme.green700 : theme.green800 }]}>{termPassed ? '✓ PASSED' : 'PASSED THIS TERM'}</Text></Pressable></View>
              <View style={styles.courseGrid}>{termCourses.map((course) => <SetupCourseTile key={course.code} course={course} status={statuses[course.code] ?? 'pending'} mode="history" onPress={() => onCourse(course, statuses[course.code] === 'passed' ? 'pending' : 'passed', context)} />)}</View>
              {error?.context === context && <ProgressErrorBubble error={error} compact />}
            </View>
          );
        })}
      </View>
      <PrimaryButton label={nextLabel} onPress={onNext} style={styles.primaryAction} />
    </ScrollView>
  );
}

function CurrentCoursesStep({ curriculum, currentTermId, startYear, statuses, visibleCourses, currentStepPassedCodes, error, onCourse, onComplete }: {
  curriculum: Curriculum;
  currentTermId: string;
  startYear: number;
  statuses: Record<string, CourseStatus>;
  visibleCourses: Course[];
  currentStepPassedCodes: string[];
  error: VisibleError | null;
  onCourse: (course: Course, status: CourseStatus) => void;
  onComplete: () => void;
}) {
  const theme = useAppTheme();
  const eligible = new Set(eligibleCourseCodes(curriculum, statuses));
  const retainedPassed = new Set(currentStepPassedCodes);
  const currentTerm = curriculum.terms.find((term) => term.id === currentTermId) ?? curriculum.terms[0];
  const candidates = visibleCourses.filter((course) => eligible.has(course.code) || statuses[course.code] === 'active' || retainedPassed.has(course.code));
  const recommended = candidates.filter((course) => course.originalTermId === currentTerm.id);
  const other = candidates
    .filter((course) => course.originalTermId !== currentTerm.id)
    .sort((left, right) => {
      const a = curriculum.terms.find((term) => term.id === left.originalTermId)?.order ?? 99;
      const b = curriculum.terms.find((term) => term.id === right.originalTermId)?.order ?? 99;
      return Math.abs(a - currentTerm.order) - Math.abs(b - currentTerm.order) || a - b;
    })
    .slice(0, 12);
  const activeCount = visibleCourses.filter((course) => statuses[course.code] === 'active').length;
  const offTermPassedCount = currentStepPassedCodes.filter((code) => statuses[code] === 'passed').length;
  return (
    <ScrollView contentContainerStyle={styles.wizardPage}>
      <Text style={[styles.eyebrow, { color: theme.active }]}>CURRENTLY TAKING</Text>
      <Text style={[styles.title, { color: theme.ink }]}>Build your current course roster</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>{academicTermLabel(currentTerm, { startYear, startTerm: 1, currentYear: currentTerm.year, currentTerm: currentTerm.term, currentTermId, currentCourseCodes: [], inferredPassedCodes: [], manualPassedCodes: [] })} · Mark courses as Currently Taking or Already Passed. Off-term completions still require every prerequisite.</Text>
      {error?.context === 'current' && <ProgressErrorBubble error={error} />}
      <CourseChoiceSection title="Recommended for current term" helper="Official current-term courses whose prerequisites are passed." courses={recommended} statuses={statuses} onCourse={onCourse} />
      <CourseChoiceSection title="Other eligible courses" helper="Relevant irregular-progress options. Only the nearest eligible courses are shown." courses={other} statuses={statuses} onCourse={onCourse} />
      <View style={[styles.currentSummary, { backgroundColor: theme.activeSoft, borderColor: theme.active }]}><Text style={[styles.currentSummaryTitle, { color: theme.active }]}>{activeCount} active · {offTermPassedCount} newly marked passed</Text><Text style={[styles.currentSummaryText, { color: theme.muted }]}>Each valid off-term pass is applied immediately, so newly unlocked choices appear without restarting setup.</Text></View>
      <PrimaryButton label="Finish academic setup" onPress={onComplete} style={styles.primaryAction} />
    </ScrollView>
  );
}

function CourseChoiceSection({ title, helper, courses, statuses, onCourse }: { title: string; helper: string; courses: Course[]; statuses: Record<string, CourseStatus>; onCourse: (course: Course, status: CourseStatus) => void }) {
  const theme = useAppTheme();
  return <View style={[styles.choiceSection, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.choiceTitle, { color: theme.ink }]}>{title}</Text><Text style={[styles.choiceHelper, { color: theme.muted }]}>{helper}</Text><View style={styles.currentGrid}>{courses.map((course) => <SetupCourseTile key={course.code} course={course} status={statuses[course.code] ?? 'pending'} mode="current" onStatusChange={(status) => onCourse(course, status)} />)}{courses.length === 0 && <Text style={[styles.emptyText, { color: theme.muted }]}>No courses in this group. Complete a prerequisite on a previous page to unlock more.</Text>}</View></View>;
}

function ProgressErrorBubble({ error, compact = false }: { error: ProgressValidationError; compact?: boolean }) {
  const theme = useAppTheme();
  return <View accessibilityRole="alert" style={[styles.errorBubble, compact && styles.errorBubbleCompact, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}><Text style={[styles.errorTitle, { color: theme.danger }]}>⚠ Prerequisite blocked</Text><Text style={[styles.errorMessage, { color: theme.ink }]}>{error.message}</Text></View>;
}

function SetupCourseTile({ course, status, mode, onPress, onStatusChange }: { course: Course; status: CourseStatus; mode: 'history' | 'current'; onPress?: () => void; onStatusChange?: (status: CourseStatus) => void }) {
  const theme = useAppTheme();
  const department = courseDepartment(course.code);
  const departmentAccent = department === 'CPE' ? theme.arrowCpe : department === 'COE' ? theme.arrowCoe : theme.arrowGed;
  const passed = status === 'passed';
  const active = status === 'active';
  const background = passed ? theme.green100 : active ? theme.activeSoft : theme.canvas;
  const accent = passed ? theme.green700 : active ? theme.active : departmentAccent;
  const label = passed ? '✓ PASSED' : active ? '● ACTIVE NOW' : mode === 'history' ? 'MARK PASSED' : 'CHOOSE STATUS';
  const content = <>
      <View style={styles.tileTop}><View style={styles.codeGroup}><View style={[styles.departmentDot, { backgroundColor: departmentAccent }]} /><Text style={[styles.courseCode, { color: accent }]}>{course.code}</Text></View><Text style={[styles.units, { color: theme.muted }]}>{course.units}u</Text></View>
      <Text numberOfLines={2} style={[styles.courseTitle, { color: theme.ink }]}>{course.title}</Text>
      <Text style={[styles.statusLabel, { color: accent }]}>{label}</Text>
    </>;
  if (mode === 'history') return <Pressable accessibilityLabel={`${course.code}, ${label}`} onPress={onPress} style={({ pressed }) => [styles.courseTile, { backgroundColor: background, borderColor: accent, shadowColor: accent }, passed && styles.courseSelected, pressed && styles.pressed]}>{content}</Pressable>;
  return <View style={[styles.courseTile, styles.currentCourseTile, { backgroundColor: background, borderColor: accent, shadowColor: accent }, (passed || active) && styles.courseSelected]}>{content}<View style={styles.currentActions}><Pressable accessibilityLabel={`${course.code}, Currently Taking`} onPress={() => onStatusChange?.(active ? 'pending' : 'active')} style={[styles.currentAction, { backgroundColor: active ? theme.active : theme.surface, borderColor: theme.active }]}><Text style={[styles.currentActionText, { color: active ? contrastText(theme.active) : theme.active }]}>{active ? '✓ CURRENTLY TAKING' : 'CURRENTLY TAKING'}</Text></Pressable><Pressable accessibilityLabel={`${course.code}, Already Passed`} onPress={() => onStatusChange?.(passed ? 'pending' : 'passed')} style={[styles.currentAction, { backgroundColor: passed ? theme.green800 : theme.surface, borderColor: theme.green700 }]}><Text style={[styles.currentActionText, { color: passed ? contrastText(theme.green800) : theme.green700 }]}>{passed ? '✓ ALREADY PASSED' : 'ALREADY PASSED'}</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { minHeight: 64, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 88, paddingVertical: 9 },
  backText: { fontSize: 11, fontWeight: '900' },
  stepCopy: { flex: 1, maxWidth: 560 },
  stepText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  progressTrack: { marginTop: 7, height: 5, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 5 },
  centerPage: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 26, paddingTop: 48, paddingBottom: 56 },
  wizardPage: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 24, paddingBottom: 56 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.35 },
  title: { marginTop: 7, fontSize: 31, lineHeight: 37, fontWeight: '900' },
  subtitle: { marginTop: 8, maxWidth: 720, fontSize: 13, lineHeight: 20 },
  fieldLabel: { marginTop: 28, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  yearChoices: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearChoice: { width: 154, minHeight: 52, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center' },
  yearChoiceText: { flex: 1, fontSize: 12, fontWeight: '900' },
  selectedTick: { fontSize: 15, fontWeight: '900' },
  primaryAction: { marginTop: 24 },
  yearHero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  yearPass: { minHeight: 44, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  yearPassText: { fontSize: 9, fontWeight: '900' },
  termColumns: { marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  termCard: { flexGrow: 1, flexBasis: 320, minWidth: 280, padding: 14, borderRadius: 18, borderWidth: 1.5 },
  termHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  termTitle: { fontSize: 16, fontWeight: '900' },
  termMeta: { marginTop: 2, fontSize: 9, fontWeight: '700' },
  termPass: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  termPassText: { fontSize: 7.5, fontWeight: '900' },
  courseGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  currentGrid: { marginTop: 11, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  courseTile: { flexGrow: 1, flexBasis: 135, maxWidth: 220, minHeight: 103, padding: 10, borderRadius: 12, borderWidth: 1.5, borderLeftWidth: 5 },
  currentCourseTile: { flexBasis: 205, maxWidth: 278, minHeight: 156 },
  courseSelected: { borderWidth: 2.5, borderLeftWidth: 6, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  codeGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  departmentDot: { width: 7, height: 7, borderRadius: 4 },
  courseCode: { fontSize: 10, fontWeight: '900' },
  units: { fontSize: 8, fontWeight: '800' },
  courseTitle: { marginTop: 5, fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
  statusLabel: { marginTop: 'auto', paddingTop: 7, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.35 },
  currentActions: { marginTop: 8, flexDirection: 'row', gap: 5 },
  currentAction: { flex: 1, minHeight: 34, paddingHorizontal: 5, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  currentActionText: { textAlign: 'center', fontSize: 6.5, lineHeight: 9, fontWeight: '900' },
  errorBubble: { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 2 },
  errorBubbleCompact: { width: '100%', marginTop: 10, padding: 11 },
  errorTitle: { fontSize: 11, fontWeight: '900' },
  errorMessage: { marginTop: 5, fontSize: 10, lineHeight: 16, fontWeight: '700' },
  choiceSection: { marginTop: 18, padding: 15, borderRadius: 18, borderWidth: 1 },
  choiceTitle: { fontSize: 17, fontWeight: '900' },
  choiceHelper: { marginTop: 3, fontSize: 10, lineHeight: 15 },
  emptyText: { paddingVertical: 18, fontSize: 10, lineHeight: 16 },
  currentSummary: { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  currentSummaryTitle: { fontSize: 12, fontWeight: '900' },
  currentSummaryText: { marginTop: 4, fontSize: 10, lineHeight: 15 },
});
