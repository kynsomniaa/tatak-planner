import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { Course, CourseRatingSummary, CourseStatus, CurriculumTerm } from '../types';
import { PrimaryButton, SectionTitle } from './ui';

const statuses: CourseStatus[] = ['passed', 'active', 'pending', 'retake'];

export function CourseDetailsModal({
  course,
  status,
  terms,
  currentTermId,
  visible,
  onClose,
  onStatusChange,
  gradeEntries,
  onGradeChange,
  onMove,
  readOnly = false,
  dependentCodes = [],
  ratingSummary,
  primaryActionLabel,
  onPrimaryAction,
  onPlanRetake,
  onRemove,
  allowMove = true,
  allowStatusEdit = true,
  allowGrades = true,
}: {
  course: Course | null;
  status: CourseStatus;
  terms: CurriculumTerm[];
  currentTermId: string;
  visible: boolean;
  onClose: () => void;
  onStatusChange: (status: CourseStatus) => void;
  gradeEntries: Array<{ code: string; title: string; units: number; value?: number }>;
  onGradeChange: (code: string, grade?: number) => void;
  onMove: (termId: string) => void;
  readOnly?: boolean;
  dependentCodes?: string[];
  ratingSummary?: CourseRatingSummary | null;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onPlanRetake?: () => void;
  onRemove?: () => void;
  allowMove?: boolean;
  allowStatusEdit?: boolean;
  allowGrades?: boolean;
}) {
  const [moving, setMoving] = useState(false);
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  if (!course) return null;
  const official = terms.find((term) => term.id === course.originalTermId);
  const current = terms.find((term) => term.id === currentTermId);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.scrim, desktop && styles.scrimDesktop]}>
        <View style={[styles.sheet, { backgroundColor: theme.canvas }, desktop && styles.sheetDesktop]}>
          {!desktop && <View style={styles.handle} />}
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <View style={[styles.codeBadge, { backgroundColor: theme.green100 }]}><Text style={[styles.code, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>{course.code}</Text></View>
              <Pressable onPress={onClose} style={[styles.close, { backgroundColor: theme.surface }]}><Text style={[styles.closeText, { color: theme.ink }]}>×</Text></Pressable>
            </View>
            <Text style={[styles.title, { color: theme.ink }]}>{course.title}</Text>
            <Text style={[styles.description, { color: theme.muted }]}>{course.description}</Text>

            <View style={styles.facts}>
              <Fact label="Units" value={String(course.units)} />
              <Fact label="Official term" value={official?.label ?? 'Unknown'} />
              <Fact label="Planned term" value={current?.label ?? 'Not in personal plan'} />
              <Fact label="Status" value={status[0].toUpperCase() + status.slice(1)} />
            </View>

            <SectionTitle title="Course rules" />
            <Rule label="Prerequisites" values={course.prerequisites} empty="None" />
            <Rule label="Corequisites / laboratory" values={[...course.corequisites, ...course.linkedLaboratories]} empty="None" />
            <Rule label="Dependent courses" values={dependentCodes} empty="None" />
            <Text style={[styles.availability, { color: theme.muted }]}>Course availability is not checked by this unofficial planner.</Text>

            <SectionTitle title="Community rating" />
            {ratingSummary && ratingSummary.count > 0 ? (
              <View style={styles.ratingGrid}>
                <Fact label="Difficulty" value={`${ratingSummary.difficulty?.toFixed(1)} / 5`} />
                <Fact label="Workload" value={`${ratingSummary.workload?.toFixed(1)} / 5`} />
                <Fact label="Usefulness" value={`${ratingSummary.usefulness?.toFixed(1)} / 5`} />
                <Text style={[styles.ratingCount, { color: theme.muted }]}>{ratingSummary.count} student rating{ratingSummary.count === 1 ? '' : 's'}</Text>
              </View>
            ) : <Text style={[styles.emptyRating, { color: theme.muted }]}>No community ratings yet.</Text>}

            <SectionTitle title="Optional grades" />
            <Text style={[styles.gradeHelp, { color: theme.muted }]}>
              Blank grades are ignored. GWA is weighted by units for this specific attempt and term.
            </Text>
            {gradeEntries.map((entry) => readOnly || !allowGrades ? (
              <View key={entry.code} style={[styles.gradeRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.gradeCopy}>
                  <Text style={[styles.gradeCode, { color: theme.green700 }]}>{entry.code} · {entry.units}u</Text>
                  <Text numberOfLines={1} style={[styles.gradeTitle, { color: theme.muted }]}>{entry.title}</Text>
                </View>
                <Text style={[styles.readOnlyGrade, { color: theme.green700 }]}>{entry.value ?? '—'}</Text>
              </View>
            ) : <GradeField key={entry.code} entry={entry} onChange={onGradeChange} />)}

            {!readOnly && allowStatusEdit && <SectionTitle title="Progress status" />}
            {!readOnly && allowStatusEdit && (
              <View style={styles.statusGrid}>
                {statuses.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => onStatusChange(option)}
                    style={[styles.statusChoice, { backgroundColor: theme.surface, borderColor: theme.border }, status === option && styles.statusSelected, status === option && { backgroundColor: theme.green800, borderColor: theme.green800 }]}
                  >
                    <Text style={[styles.statusChoiceText, { color: status === option ? contrastText(theme.green800) : theme.ink }]}>
                      {option[0].toUpperCase() + option.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!readOnly && allowMove && (
              <PrimaryButton
                label={moving ? 'Close term chooser' : 'Move to another trimester'}
                onPress={() => setMoving((value) => !value)}
                tone="light"
                style={styles.actionButton}
                disabled={status === 'passed' || status === 'active'}
              />
            )}
            {!readOnly && allowMove && moving && (
              <View style={[styles.termList, { borderColor: theme.border }]}>
                {terms.map((term) => (
                  <Pressable
                    key={term.id}
                    disabled={term.id === currentTermId}
                    onPress={() => {
                      onMove(term.id);
                      setMoving(false);
                    }}
                    style={[styles.termChoice, { backgroundColor: theme.surface, borderBottomColor: theme.border }, term.id === currentTermId && styles.termChoiceCurrent, term.id === currentTermId && { backgroundColor: theme.green100 }]}
                  >
                    <Text style={[styles.termChoiceText, { color: theme.ink }]}>{term.label}</Text>
                    {term.id === currentTermId && <Text style={[styles.currentText, { color: theme.green700 }]}>Current</Text>}
                  </Pressable>
                ))}
              </View>
            )}
            {onPrimaryAction && primaryActionLabel && (
              <PrimaryButton label={primaryActionLabel} onPress={onPrimaryAction} style={styles.actionButton} />
            )}
            {onPlanRetake && (
              <PrimaryButton label="Plan another attempt" onPress={onPlanRetake} tone="light" style={styles.actionButton} />
            )}
            {onRemove && (
              <PrimaryButton label="Remove from personal plan" onPress={onRemove} tone="danger" style={styles.actionButton} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function GradeField({
  entry,
  onChange,
}: {
  entry: { code: string; title: string; units: number; value?: number };
  onChange: (code: string, grade?: number) => void;
}) {
  const theme = useAppTheme();
  const [text, setText] = useState(entry.value === undefined ? '' : String(entry.value));
  const [error, setError] = useState('');
  useEffect(() => {
    setText(entry.value === undefined ? '' : String(entry.value));
    setError('');
  }, [entry.code, entry.value]);

  const save = () => {
    const normalized = text.trim().replace(',', '.');
    if (!normalized) {
      setError('');
      onChange(entry.code, undefined);
      return;
    }
    const grade = Number(normalized);
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
      setError('Enter a number from 0 to 100.');
      return;
    }
    setError('');
    onChange(entry.code, grade);
  };

  return (
    <View style={[styles.gradeRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.gradeCopy}>
        <Text style={[styles.gradeCode, { color: theme.green700 }]}>{entry.code} · {entry.units}u</Text>
        <Text numberOfLines={1} style={[styles.gradeTitle, { color: theme.muted }]}>{entry.title}</Text>
        {error ? <Text style={styles.gradeError}>{error}</Text> : null}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={save}
        onSubmitEditing={save}
        keyboardType="decimal-pad"
        placeholder="Grade"
        placeholderTextColor={theme.muted}
        style={[styles.gradeInput, { backgroundColor: theme.canvas, borderColor: theme.border, color: theme.ink }, Boolean(error) && styles.gradeInputError]}
      />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.fact, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.factLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: theme.ink }]}>{value}</Text>
    </View>
  );
}

function Rule({ label, values, empty }: { label: string; values: string[]; empty: string }) {
  const unique = [...new Set(values)];
  const theme = useAppTheme();
  return (
    <View style={[styles.rule, { borderBottomColor: theme.border }]}>
      <Text style={[styles.ruleLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.ruleValue, { color: theme.ink }]}>{unique.length > 0 ? unique.join(', ') : empty}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(4,25,16,0.48)', justifyContent: 'flex-end' },
  scrimDesktop: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  sheetDesktop: { width: 430, height: '100%', maxHeight: '100%', borderTopRightRadius: 0, borderBottomLeftRadius: 26 },
  handle: { width: 46, height: 5, borderRadius: 4, backgroundColor: '#B5BEB9', alignSelf: 'center', marginTop: 10 },
  content: { padding: 22, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeBadge: { backgroundColor: colors.green100, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  code: { color: colors.green900, fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E7ECE9', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 25, color: colors.ink, marginTop: -2 },
  title: { marginTop: 13, fontSize: 25, lineHeight: 30, fontWeight: '900', color: colors.ink },
  description: { marginTop: 8, color: colors.muted, lineHeight: 21 },
  facts: { marginTop: 18, gap: 8 },
  fact: { padding: 13, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  factLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  factValue: { marginTop: 3, color: colors.ink, fontSize: 14, fontWeight: '800' },
  rule: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  ruleLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  ruleValue: { marginTop: 3, color: colors.ink, fontSize: 14, fontWeight: '800' },
  availability: { marginTop: 10, color: colors.muted, fontSize: 11, fontStyle: 'italic' },
  ratingGrid: { gap: 7 },
  ratingCount: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: '700' },
  emptyRating: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  gradeHelp: { marginBottom: 9, color: colors.muted, fontSize: 11, lineHeight: 17 },
  gradeRow: { marginBottom: 7, padding: 11, flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  gradeCopy: { flex: 1, marginRight: 9 },
  gradeCode: { color: colors.green800, fontSize: 11, fontWeight: '900' },
  gradeTitle: { marginTop: 2, color: colors.muted, fontSize: 10 },
  gradeError: { marginTop: 3, color: colors.danger, fontSize: 9, fontWeight: '700' },
  gradeInput: { width: 78, height: 42, paddingHorizontal: 9, textAlign: 'center', color: colors.ink, fontWeight: '800', borderRadius: 10, borderWidth: 1, borderColor: '#B8C5BF', backgroundColor: colors.canvas },
  gradeInputError: { borderColor: colors.danger },
  readOnlyGrade: { color: colors.green900, fontSize: 17, fontWeight: '900' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChoice: { width: '47%', padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  statusSelected: { backgroundColor: colors.green800, borderColor: colors.green800 },
  statusChoiceText: { color: colors.ink, fontWeight: '800' },
  statusSelectedText: { color: '#FFFFFF' },
  actionButton: { marginTop: 12 },
  termList: { marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  termChoice: { padding: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  termChoiceCurrent: { backgroundColor: colors.green100 },
  termChoiceText: { color: colors.ink, fontWeight: '700' },
  currentText: { color: colors.green700, fontSize: 11, fontWeight: '900' },
});
