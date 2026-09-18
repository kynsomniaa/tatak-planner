import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { contrastText, useAppTheme } from '../theme';
import { StarRating } from './StarRating';

export type TourSection = 'map' | 'ratings' | 'progress' | 'settings';

export interface TourStep {
  id: string;
  section: TourSection;
  targetId: string;
  signal: string;
  title: string;
  body: string;
  preferredSide?: 'top' | 'bottom' | 'left' | 'right';
  stars?: boolean;
}

export const tourSteps: TourStep[] = [
  { id: 'curriculum', section: 'map', targetId: 'tour-curriculum-map', signal: '01 // ORIENT', title: 'Curriculum Map', body: 'This is what lies ahead. Fields stay clustered while prerequisite arrows show how courses unlock one another.', preferredSide: 'right' },
  { id: 'states', section: 'map', targetId: 'tour-node-states', signal: '02 // READ THE MAP', title: 'Node states', body: 'Conquered, active, planned, available, retake, and locked courses each have a distinct signal. Your map updates with Progress.', preferredSide: 'bottom' },
  { id: 'controls', section: 'map', targetId: 'tour-map-controls', signal: '03 // NAVIGATE', title: 'Map controls', body: 'Roam across empty space, zoom with the controls or trackpad gesture, fit the whole map, or enter Full Screen.', preferredSide: 'bottom' },
  { id: 'paths', section: 'map', targetId: 'tour-path-tools', signal: '04 // TRACE', title: 'Prerequisite paths', body: 'Select or hover a course to isolate its route. Show every arrow only when you need the complete dependency network.', preferredSide: 'bottom' },
  { id: 'raid-planner', section: 'map', targetId: 'tour-raid-planner', signal: '05 // ASSEMBLE', title: 'Raid Planner', body: 'This is where the next move becomes a plan. Add only eligible courses and watch units, GWA, and prerequisite rules.', preferredSide: 'left' },
  { id: 'raids', section: 'map', targetId: 'tour-raids', signal: '06 // TERMS', title: 'Raids', body: 'Each raid represents one trimester. The current raid is marked, history is preserved, and future raids can be renamed.', preferredSide: 'bottom' },
  { id: 'strategies', section: 'map', targetId: 'tour-strategies', signal: '07 // PLAN A ROUTE', title: 'Strategy modes', body: 'Thesis, internship, and lighter-workload modes suggest strictly eligible next courses. The curriculum rules always win.', preferredSide: 'bottom' },
  { id: 'ratings', section: 'ratings', targetId: 'tour-ratings-overview', signal: '08 // SCOUT AHEAD', title: 'Ratings', body: 'The map shows what is ahead; Ratings help you scout what it may feel like; the Raid Planner turns that insight into a balanced term.', preferredSide: 'bottom', stars: true },
  { id: 'course-intel', section: 'ratings', targetId: 'tour-rating-intel', signal: '★ COURSE INTEL', title: 'Community signals', body: 'Difficulty, workload, and usefulness are subjective student experiences—not academic rules. Prerequisites and the official curriculum always take priority.', preferredSide: 'bottom', stars: true },
  { id: 'progress', section: 'progress', targetId: 'tour-progress', signal: '09 // RECORD', title: 'Progress & grades', body: 'Mark completed or active courses, add optional grades, and review trimester GWA. These states power the map and course eligibility.', preferredSide: 'right' },
  { id: 'settings', section: 'settings', targetId: 'tour-settings', signal: '10 // CONFIGURE', title: 'Settings', body: 'Change the palette, review your account and program, or replay this walkthrough whenever you need a refresher.', preferredSide: 'left' },
];

interface TargetRect { left: number; top: number; width: number; height: number }

export function GuidedTour({ visible, onClose, onStepChange }: {
  visible: boolean;
  onClose: (finished: boolean) => void;
  onStepChange: (step: TourStep) => void;
}) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const step = tourSteps[index];
  const desktop = width >= 900;

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    onStepChange(step);
  }, [visible, index, step.id]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || !desktop) {
      setTarget(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const measure = () => {
      if (cancelled) return;
      const node = document.getElementById(step.targetId);
      if (!node) {
        setTarget(null);
        if (attempts++ < 12) window.setTimeout(measure, 80);
        return;
      }
      node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      const rect = node.getBoundingClientRect();
      setTarget({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    const timer = window.setTimeout(measure, 40);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [visible, index, desktop, width, height, step.targetId]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false);
      if (event.key === 'ArrowLeft' && index > 0) setIndex((value) => value - 1);
      if (event.key === 'ArrowRight') {
        if (index < tourSteps.length - 1) setIndex((value) => value + 1);
        else onClose(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, index, onClose]);

  const card = useMemo(() => {
    const cardWidth = Math.min(390, width - 32);
    const cardHeight = step.stars ? 292 : 258;
    if (!target) return { left: Math.max(16, (width - cardWidth) / 2), top: Math.max(16, (height - cardHeight) / 2), width: cardWidth };
    const gap = 18;
    const margin = 16;
    const fits = {
      right: width - (target.left + target.width) >= cardWidth + gap + margin,
      left: target.left >= cardWidth + gap + margin,
      bottom: height - (target.top + target.height) >= cardHeight + gap + margin,
      top: target.top >= cardHeight + gap + margin,
    };
    const preferred = step.preferredSide ?? 'right';
    const side = fits[preferred] ? preferred : (['right', 'left', 'bottom', 'top'] as const).find((item) => fits[item]) ?? 'bottom';
    let left = target.left + target.width + gap;
    let top = target.top + target.height / 2 - cardHeight / 2;
    if (side === 'left') left = target.left - cardWidth - gap;
    if (side === 'bottom') { left = target.left + target.width / 2 - cardWidth / 2; top = target.top + target.height + gap; }
    if (side === 'top') { left = target.left + target.width / 2 - cardWidth / 2; top = target.top - cardHeight - gap; }
    return { left: Math.max(margin, Math.min(width - cardWidth - margin, left)), top: Math.max(margin, Math.min(height - cardHeight - margin, top)), width: cardWidth };
  }, [target, width, height, step.preferredSide, step.stars]);

  if (!visible) return null;
  const pad = 7;
  const rect = target ? {
    left: Math.max(0, target.left - pad), top: Math.max(0, target.top - pad),
    width: Math.min(width, target.width + pad * 2), height: Math.min(height, target.height + pad * 2),
  } : null;
  const scrim = 'rgba(4, 7, 6, 0.82)';

  return (
    <View accessibilityViewIsModal nativeID="tam-core-guided-tour" style={styles.overlay}>
      {!desktop ? <View style={[styles.mobileScrim, { backgroundColor: scrim }]} /> : rect ? <>
        <View style={[styles.mask, { left: 0, top: 0, right: 0, height: rect.top, backgroundColor: scrim }]} />
        <View style={[styles.mask, { left: 0, top: rect.top, width: rect.left, height: rect.height, backgroundColor: scrim }]} />
        <View style={[styles.mask, { left: rect.left + rect.width, right: 0, top: rect.top, height: rect.height, backgroundColor: scrim }]} />
        <View style={[styles.mask, { left: 0, right: 0, top: rect.top + rect.height, bottom: 0, backgroundColor: scrim }]} />
        <View pointerEvents="none" style={[styles.ring, { left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderColor: theme.gold, shadowColor: theme.gold }]} />
        <View style={[styles.targetBlock, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }]} />
      </> : <View style={[styles.mobileScrim, { backgroundColor: scrim }]} />}

      <View style={[styles.card, card, { backgroundColor: theme.surface, borderColor: theme.gold, shadowColor: theme.green900 }]}>
        <View style={styles.cardTop}>
          <Text style={[styles.signal, { color: theme.green700 }]}>{step.signal}</Text>
          <Text style={[styles.counter, { color: theme.muted }]}>{index + 1} / {tourSteps.length}</Text>
        </View>
        <Text style={[styles.title, { color: theme.ink }]}>{step.title}</Text>
        {step.stars && <View style={[styles.stars, { backgroundColor: theme.canvas, borderColor: theme.border }]}>
          <StarRating value={4} size="sm" label="Difficulty" valueColor={theme.green700} />
          <StarRating value={3} size="sm" label="Workload" valueColor={theme.green700} />
          <StarRating value={5} size="sm" label="Usefulness" valueColor={theme.green700} />
        </View>}
        <Text style={[styles.body, { color: theme.muted }]}>{desktop ? step.body : 'The guided map tour is designed for a desktop-sized screen. You can replay it later from Settings.'}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => onClose(false)} style={styles.skip}><Text style={[styles.skipText, { color: theme.muted }]}>{desktop ? 'Skip' : 'Close'}</Text></Pressable>
          {desktop && index > 0 && <Pressable onPress={() => setIndex((value) => value - 1)} style={[styles.secondary, { backgroundColor: theme.canvas, borderColor: theme.border }]}><Text style={[styles.secondaryText, { color: theme.ink }]}>Back</Text></Pressable>}
          {desktop && <Pressable onPress={() => index === tourSteps.length - 1 ? onClose(true) : setIndex((value) => value + 1)} style={[styles.next, { backgroundColor: theme.gold }]}><Text style={[styles.nextText, { color: contrastText(theme.gold) }]}>{index === tourSteps.length - 1 ? 'Finish' : 'Next'}</Text></Pressable>}
        </View>
        {desktop && <Text style={[styles.keyboard, { color: theme.muted }]}>← → navigate · Esc closes</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'fixed' as never, left: 0, top: 0, right: 0, bottom: 0, zIndex: 50000, elevation: 50000 },
  mobileScrim: { ...StyleSheet.absoluteFillObject },
  mask: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, borderRadius: 16, shadowOpacity: 0.9, shadowRadius: 22, elevation: 50001 },
  targetBlock: { position: 'absolute', backgroundColor: 'transparent', zIndex: 50002 },
  card: { position: 'absolute', minHeight: 242, padding: 20, borderRadius: 18, borderWidth: 2, shadowOpacity: 0.32, shadowRadius: 28, elevation: 50003, zIndex: 50003 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  signal: { flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  counter: { fontSize: 9, fontWeight: '900' },
  title: { marginTop: 9, fontSize: 23, lineHeight: 28, fontWeight: '900' },
  body: { marginTop: 9, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  stars: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  actions: { marginTop: 'auto', paddingTop: 17, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 7 },
  skip: { paddingHorizontal: 9, paddingVertical: 9 },
  skipText: { fontSize: 10, fontWeight: '900' },
  secondary: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 10, fontWeight: '900' },
  next: { minHeight: 36, paddingHorizontal: 17, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 10, fontWeight: '900' },
  keyboard: { marginTop: 9, textAlign: 'right', fontSize: 8, fontWeight: '700' },
});
