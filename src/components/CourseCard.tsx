import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { Course, CourseStatus } from '../types';

export function CourseCard({
  course,
  status,
  onPress,
  dragHandle,
  cardLabel = 'code',
  labCodes = [],
  combinedUnits,
  statusLabel,
  highlighted = false,
  highlightVariant = 'standard',
  dimmed = false,
  compact = false,
  selected = false,
  disabled = false,
  onInfoPress,
}: {
  course: Course;
  status: CourseStatus;
  onPress: () => void;
  dragHandle?: ReactNode;
  cardLabel?: 'code' | 'title';
  labCodes?: string[];
  combinedUnits?: number;
  statusLabel?: string;
  highlighted?: boolean;
  highlightVariant?: 'standard' | 'internship' | 'thesis';
  dimmed?: boolean;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onInfoPress?: () => void;
}) {
  const theme = useAppTheme();
  const activePulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (status !== 'active') {
      activePulse.stopAnimation();
      activePulse.setValue(0.45);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(activePulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(activePulse, { toValue: 0.35, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [activePulse, status]);
  const badgeBackground = status === 'passed' || status === 'active' ? theme.green100 : status === 'retake' ? theme.dangerSoft : theme.canvas;
  const badge = {
    label: status === 'passed' ? 'Passed' : status === 'active' ? 'Active' : status === 'retake' ? 'Retake' : 'Pending',
    background: badgeBackground,
    color: status === 'active' ? contrastText(badgeBackground, '#FFFFFF', theme.green900) : status === 'retake' ? theme.danger : status === 'pending' ? theme.muted : contrastText(badgeBackground, '#FFFFFF', theme.green900),
  };
  const category = course.code.startsWith('CPE')
    ? 'CPE'
    : course.code.startsWith('COE')
      ? 'COE'
      : course.code.startsWith('GED')
        ? 'GED'
        : 'CORE';
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [
      styles.card,
      compact && styles.cardCompact,
      { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.green900 },
      status === 'passed' && { backgroundColor: theme.green100, borderColor: theme.green700, borderLeftWidth: 6 },
      status === 'active' && { backgroundColor: theme.green100, borderColor: theme.green700, borderLeftWidth: 5 },
      status === 'retake' && { backgroundColor: theme.dangerSoft, borderColor: theme.danger, borderLeftWidth: 5 },
      highlighted && highlightVariant === 'standard' && { borderColor: theme.green700, borderWidth: 3, shadowOpacity: 0.18 },
      highlighted && highlightVariant === 'internship' && { borderColor: theme.gold, borderWidth: 3, borderStyle: 'dashed', backgroundColor: theme.warningSoft, shadowOpacity: 0.2 },
      highlighted && highlightVariant === 'thesis' && { borderColor: theme.green700, borderWidth: 4, backgroundColor: theme.green100, shadowColor: theme.green700, shadowOpacity: 0.3, shadowRadius: 13 },
      selected && { borderColor: theme.gold, borderWidth: 3, backgroundColor: theme.warningSoft },
      dimmed && styles.cardDimmed,
      disabled && styles.cardDisabled,
      pressed && styles.pressed,
    ]}>
      {status === 'passed' && (
        <View style={[styles.doneSeal, { backgroundColor: theme.green700 }]}> 
          <Text style={[styles.doneCheck, { color: contrastText(theme.green700) }]}>✓</Text>
          <Text style={[styles.doneText, { color: contrastText(theme.green700) }]}>DONE</Text>
        </View>
      )}
      {selected && <View style={[styles.selectionCheck, { backgroundColor: theme.gold }]}><Text style={[styles.selectionCheckText, { color: theme.green900 }]}>✓</Text></View>}
      <View style={styles.topRow}>
        <View style={[styles.categoryBadge, { backgroundColor: theme.canvas, borderColor: category === 'CPE' ? theme.green700 : category === 'COE' ? theme.blue : theme.gold }]}>
          <Text style={[styles.categoryText, { color: theme.ink }]}>{category}</Text>
        </View>
        <View style={[styles.status, { backgroundColor: badge.background }]}>
          <Text style={[styles.statusText, { color: badge.color }]}>{statusLabel ?? badge.label}</Text>
        </View>
        {dragHandle}
        {onInfoPress && (
          <Pressable onPress={(event) => { event.stopPropagation(); onInfoPress(); }} style={[styles.infoButton, { backgroundColor: theme.canvas }]}> 
            <Text style={[styles.infoText, { color: theme.green700 }]}>i</Text>
          </Pressable>
        )}
      </View>
      <Text numberOfLines={2} style={[styles.title, { color: theme.ink }]}>
        {cardLabel === 'code' ? course.code : course.title}
      </Text>
      <Text numberOfLines={1} style={[styles.secondaryLabel, { color: theme.muted }]}> 
        {cardLabel === 'code' ? course.title : course.code}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: theme.muted }]}>{combinedUnits ?? course.units} units</Text>
        <Text style={[styles.dot, { color: theme.muted }]}>•</Text>
        <Text style={[styles.meta, { color: theme.muted }]}>{course.prerequisites.length} prerequisites</Text>
      </View>
      <View style={styles.indicatorRow}>
        {status === 'active' && <Animated.View style={[styles.activePulse, { backgroundColor: theme.green700, opacity: activePulse }]} />}
        {course.prerequisites.slice(0, 4).map((code) => <View key={code} style={[styles.prereqDot, { backgroundColor: theme.gold }]} />)}
        {course.prerequisites.length === 0 && <Text style={[styles.noPrereq, { color: theme.muted }]}>No prerequisite</Text>}
        {labCodes.length > 0 && (
          <View style={[styles.labBadge, { backgroundColor: theme.canvas, borderColor: theme.blue }]}><Text style={[styles.labText, { color: theme.blue }]}>LAB · {labCodes.join(', ')}</Text></View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 142,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0A2C1D',
    shadowOpacity: 0.06,
    shadowRadius: 9,
    elevation: 2,
  },
  cardCompact: { height: 116, padding: 11, borderRadius: 13 },
  pressed: { opacity: 0.8 },
  cardPassed: { backgroundColor: '#D9F6E5', borderColor: '#43AA70', borderLeftWidth: 6 },
  cardRetake: { backgroundColor: '#FFF0EE', borderColor: '#E3A39A', borderLeftWidth: 5 },
  cardHighlighted: { borderColor: colors.gold, borderWidth: 3, shadowOpacity: 0.16 },
  cardSelected: { borderColor: colors.gold, borderWidth: 3, backgroundColor: '#FFF7DF' },
  cardDimmed: { opacity: 0.28 },
  cardDisabled: { opacity: 0.55 },
  doneSeal: { position: 'absolute', right: 9, bottom: 9, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', zIndex: 2 },
  doneCheck: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  doneText: { marginLeft: 3, color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  selectionCheck: { position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: 12, zIndex: 3, alignItems: 'center', justifyContent: 'center' },
  selectionCheckText: { fontSize: 13, fontWeight: '900' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  categoryBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  categoryCpe: { backgroundColor: '#D4F2F6' },
  categoryGed: { backgroundColor: '#F8DCE5' },
  categoryText: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  status: { marginLeft: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  infoButton: { marginLeft: 6, width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 12, fontWeight: '900' },
  title: { marginTop: 9, color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  secondaryLabel: { marginTop: 2, color: colors.muted, fontSize: 10 },
  metaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  meta: { color: colors.muted, fontSize: 11, flexShrink: 1 },
  dot: { marginHorizontal: 6, color: '#A6B0AB' },
  indicatorRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', minHeight: 18 },
  prereqDot: { width: 15, height: 4, borderRadius: 3, backgroundColor: colors.gold, marginRight: 4 },
  activePulse: { width: 8, height: 8, marginRight: 6, borderRadius: 4 },
  noPrereq: { color: '#8A9690', fontSize: 9 },
  labBadge: { marginLeft: 'auto', backgroundColor: '#E2ECFF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  labText: { color: colors.blue, fontSize: 8, fontWeight: '900' },
});
