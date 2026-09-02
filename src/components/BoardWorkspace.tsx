import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderHandlers,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BoardLayoutPreferences } from '../types';
import { colors, contrastText, useAppTheme } from '../theme';
import { DEFAULT_CANVAS_PADDING, DEFAULT_COLUMN_SPACING } from '../domain/boardLayout';

export const MIN_BOARD_ZOOM = 0.5;
export const MAX_BOARD_ZOOM = 1.5;

export const defaultBoardLayout = (
  completedTermIds: string[] = [],
): BoardLayoutPreferences => ({
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  columnOrder: [],
  columnPositions: {},
  columnSpacing: DEFAULT_COLUMN_SPACING,
  canvasPadding: DEFAULT_CANVAS_PADDING,
  snapToGrid: true,
  preventColumnOverlap: true,
  lockColumnPositions: false,
  collapsedTermIds: completedTermIds,
  hiddenTermIds: [],
  compactCards: false,
  hideCompletedYears: false,
  currentAndFutureOnly: false,
  showUnits: true,
  showGwa: true,
  showWarnings: true,
  showSchoolYear: true,
});

export const clampBoardZoom = (zoom: number) =>
  Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, Math.round(zoom * 10) / 10));

export function BoardWorkspace({
  layout,
  onLayoutChange,
  contentWidth,
  contentHeight,
  completedTermIds,
  completedYearCount,
  hiddenColumnCount,
  children,
}: {
  layout: BoardLayoutPreferences;
  onLayoutChange: (layout: BoardLayoutPreferences) => void;
  contentWidth: number;
  contentHeight: number;
  completedTermIds: string[];
  completedYearCount: number;
  hiddenColumnCount: number;
  children: (panHandlers: GestureResponderHandlers) => ReactNode;
}) {
  const theme = useAppTheme();
  const horizontalRef = useRef<ScrollView>(null);
  const verticalRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  const lastWheelAt = useRef(0);
  const scrollX = useRef(layout.scrollX ?? 0);
  const scrollY = useRef(layout.scrollY ?? 0);
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [customizing, setCustomizing] = useState(false);
  const [panning, setPanning] = useState(false);

  const patch = (next: Partial<BoardLayoutPreferences>) =>
    onLayoutChange({ ...layout, ...next });

  const canStartPan = (event: unknown) => {
    if (Platform.OS !== 'web') return true;
    const nativeEvent = (event as { nativeEvent?: { button?: number; buttons?: number; pointerType?: string; touches?: unknown[] } })?.nativeEvent;
    return nativeEvent?.button === 2 || nativeEvent?.buttons === 2 || nativeEvent?.pointerType === 'touch' || Boolean(nativeEvent?.touches?.length);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => canStartPan(event),
    onStartShouldSetPanResponderCapture: (event) => canStartPan(event),
    onMoveShouldSetPanResponder: (event, gesture) => canStartPan(event) && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onMoveShouldSetPanResponderCapture: (event, gesture) => canStartPan(event) && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      panStartX.current = scrollX.current;
      panStartY.current = scrollY.current;
      setPanning(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const nextX = Math.max(0, Math.min(Math.max(0, contentWidth * layout.zoom - viewportWidth), panStartX.current - gesture.dx));
      const nextY = Math.max(0, Math.min(Math.max(0, contentHeight * layout.zoom - viewportHeight), panStartY.current - gesture.dy));
      scrollX.current = nextX;
      scrollY.current = nextY;
      horizontalRef.current?.scrollTo({ x: nextX, animated: false });
      verticalRef.current?.scrollTo({ y: nextY, animated: false });
    },
    onPanResponderRelease: () => {
      setPanning(false);
      patch({ scrollX: scrollX.current, scrollY: scrollY.current });
    },
    onPanResponderTerminate: () => {
      setPanning(false);
      patch({ scrollX: scrollX.current, scrollY: scrollY.current });
    },
  }), [layout, contentWidth, contentHeight, viewportWidth, viewportHeight]);

  const fit = () => {
    const availableWidth = Math.max(320, viewportWidth - 24);
    const availableHeight = Math.max(300, viewportHeight - 24);
    patch({ zoom: clampBoardZoom(Math.min(availableWidth / Math.max(contentWidth, 1), availableHeight / Math.max(contentHeight, 1))), scrollX: 0, scrollY: 0 });
    scrollX.current = 0;
    scrollY.current = 0;
    horizontalRef.current?.scrollTo({ x: 0, animated: true });
    verticalRef.current?.scrollTo({ y: 0, animated: true });
  };

  const reset = () => {
    const next = defaultBoardLayout(completedTermIds);
    onLayoutChange(next);
    scrollX.current = 0;
    scrollY.current = 0;
    horizontalRef.current?.scrollTo({ x: 0, animated: true });
    verticalRef.current?.scrollTo({ y: 0, animated: true });
  };

  const resetView = () => {
    patch({ zoom: 1, scrollX: 0, scrollY: 0 });
    scrollX.current = 0;
    scrollY.current = 0;
    horizontalRef.current?.scrollTo({ x: 0, animated: true });
    verticalRef.current?.scrollTo({ y: 0, animated: true });
  };

  const scaledWidth = Math.max(viewportWidth, contentWidth * layout.zoom);
  const scaledHeight = contentHeight * layout.zoom;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = frameRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const isPanSurface = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('#board-pan-surface'));
    const suppressPanContextMenu = (event: MouseEvent) => {
      if (isPanSurface(event.target)) event.preventDefault();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt.current < 45 || event.deltaY === 0) return;
      lastWheelAt.current = now;
      const nextZoom = clampBoardZoom(layout.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
      if (nextZoom === layout.zoom) return;
      const bounds = node.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const contentX = (scrollX.current + pointerX) / layout.zoom;
      const contentY = (scrollY.current + pointerY) / layout.zoom;
      const nextX = Math.max(0, Math.min(Math.max(0, contentWidth * nextZoom - viewportWidth), contentX * nextZoom - pointerX));
      const nextY = Math.max(0, Math.min(Math.max(0, contentHeight * nextZoom - viewportHeight), contentY * nextZoom - pointerY));
      scrollX.current = nextX;
      scrollY.current = nextY;
      onLayoutChange({ ...layout, zoom: nextZoom, scrollX: nextX, scrollY: nextY });
      horizontalRef.current?.scrollTo({ x: nextX, animated: false });
      verticalRef.current?.scrollTo({ y: nextY, animated: false });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('contextmenu', suppressPanContextMenu);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('contextmenu', suppressPanContextMenu);
    };
  }, [contentHeight, contentWidth, layout, onLayoutChange, viewportHeight, viewportWidth]);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.toolbar, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <View style={styles.zoomGroup}>
          <Pressable accessibilityLabel="Zoom out" onPress={() => patch({ zoom: clampBoardZoom(layout.zoom - 0.1) })} style={[styles.iconButton, { backgroundColor: theme.canvas }]}>
            <Text style={[styles.iconButtonText, { color: theme.ink }]}>−</Text>
          </Pressable>
          <Text style={[styles.zoomValue, { color: theme.ink }]}>{Math.round(layout.zoom * 100)}%</Text>
          <Pressable accessibilityLabel="Zoom in" onPress={() => patch({ zoom: clampBoardZoom(layout.zoom + 0.1) })} style={[styles.iconButton, { backgroundColor: theme.canvas }]}>
            <Text style={[styles.iconButtonText, { color: theme.ink }]}>＋</Text>
          </Pressable>
          <Pressable onPress={fit} style={[styles.fitButton, { backgroundColor: theme.green100 }]}><Text style={[styles.fitText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>Fit</Text></Pressable>
        </View>
        <View style={[styles.panGrip, { backgroundColor: panning ? theme.green100 : theme.canvas }]}>
          <Text style={[styles.panGripText, { color: panning ? theme.green700 : theme.muted }]}>{panning ? '✋ Panning board…' : '✋ Right-hold empty space to pan · wheel to zoom'}</Text>
        </View>
        <Pressable onPress={() => setCustomizing((value) => !value)} style={[styles.customizeButton, { backgroundColor: customizing ? theme.green900 : theme.canvas, borderColor: theme.border }]}>
          <Text style={[styles.customizeText, { color: customizing ? contrastText(theme.green900) : theme.ink }]}>Customize board {customizing ? '▲' : '▼'}</Text>
        </Pressable>
      </View>

      {customizing && (
        <View style={[styles.customizePanel, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Toggle label="Compact cards" active={layout.compactCards} onPress={() => patch({ compactCards: !layout.compactCards })} />
          <Toggle label={`Hide completed years${completedYearCount ? ` (${completedYearCount})` : ''}`} active={layout.hideCompletedYears} onPress={() => patch({ hideCompletedYears: !layout.hideCompletedYears })} />
          <Toggle label="Current & future only" active={layout.currentAndFutureOnly} onPress={() => patch({ currentAndFutureOnly: !layout.currentAndFutureOnly })} />
          <Toggle label="Units" active={layout.showUnits} onPress={() => patch({ showUnits: !layout.showUnits })} />
          <Toggle label="GWA" active={layout.showGwa} onPress={() => patch({ showGwa: !layout.showGwa })} />
          <Toggle label="Warnings" active={layout.showWarnings} onPress={() => patch({ showWarnings: !layout.showWarnings })} />
          <Toggle label="School year" active={layout.showSchoolYear} onPress={() => patch({ showSchoolYear: !layout.showSchoolYear })} />
          <Toggle label="Snap columns to grid" active={layout.snapToGrid ?? true} onPress={() => patch({ snapToGrid: !(layout.snapToGrid ?? true) })} />
          <Toggle label="Prevent column overlap" active={layout.preventColumnOverlap ?? true} onPress={() => patch({ preventColumnOverlap: !(layout.preventColumnOverlap ?? true) })} />
          <Toggle label="Lock column positions" active={layout.lockColumnPositions ?? false} onPress={() => patch({ lockColumnPositions: !(layout.lockColumnPositions ?? false) })} />
          <Stepper label="Column gap" value={layout.columnSpacing ?? DEFAULT_COLUMN_SPACING} suffix="px" minimum={24} maximum={120} step={8} onChange={(columnSpacing) => patch({ columnSpacing })} />
          <Stepper label="Canvas space" value={layout.canvasPadding ?? DEFAULT_CANVAS_PADDING} suffix="px" minimum={100} maximum={420} step={40} onChange={(canvasPadding) => patch({ canvasPadding })} />
          <Pressable onPress={() => patch({ collapsedTermIds: [...new Set([...layout.collapsedTermIds, ...completedTermIds])] })} style={[styles.action, { backgroundColor: theme.canvas }]}><Text style={[styles.actionText, { color: theme.ink }]}>Collapse completed terms</Text></Pressable>
          <Pressable onPress={() => patch({ collapsedTermIds: [] })} style={[styles.action, { backgroundColor: theme.canvas }]}><Text style={[styles.actionText, { color: theme.ink }]}>Expand all columns</Text></Pressable>
          <Pressable disabled={hiddenColumnCount === 0} onPress={() => patch({ hiddenTermIds: [] })} style={[styles.action, { backgroundColor: theme.canvas }, hiddenColumnCount === 0 && styles.disabled]}><Text style={[styles.actionText, { color: theme.ink }]}>Restore hidden columns{hiddenColumnCount ? ` (${hiddenColumnCount})` : ''}</Text></Pressable>
          <Pressable onPress={() => patch({ columnPositions: {}, columnOrder: [] })} style={[styles.action, { backgroundColor: theme.green100 }]}><Text style={[styles.actionText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>Auto-arrange chronologically</Text></Pressable>
          <Pressable onPress={() => patch({ columnPositions: {}, columnOrder: [], columnSpacing: DEFAULT_COLUMN_SPACING, canvasPadding: DEFAULT_CANVAS_PADDING })} style={[styles.action, { backgroundColor: theme.canvas }]}><Text style={[styles.actionText, { color: theme.ink }]}>Reset term positions</Text></Pressable>
          <Pressable onPress={resetView} style={[styles.action, { backgroundColor: theme.canvas }]}><Text style={[styles.actionText, { color: theme.ink }]}>Reset zoom &amp; board view</Text></Pressable>
          <Pressable onPress={reset} style={[styles.action, { backgroundColor: theme.dangerSoft }]}><Text style={[styles.actionText, { color: theme.danger }]}>Reset board layout</Text></Pressable>
        </View>
      )}

      <View
        ref={frameRef}
        style={styles.scrollerFrame}
        onLayout={(event: LayoutChangeEvent) => {
          setViewportWidth(event.nativeEvent.layout.width);
          setViewportHeight(event.nativeEvent.layout.height);
        }}
      >
        <ScrollView
          ref={verticalRef}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentOffset={{ x: 0, y: layout.scrollY ?? 0 }}
          onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
          onMomentumScrollEnd={() => patch({ scrollX: scrollX.current, scrollY: scrollY.current })}
          scrollEventThrottle={32}
          style={styles.scroller}
          contentContainerStyle={{ minHeight: scaledHeight }}
        >
          <ScrollView
            ref={horizontalRef}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            contentOffset={{ x: layout.scrollX ?? 0, y: 0 }}
            onScroll={(event) => { scrollX.current = event.nativeEvent.contentOffset.x; }}
            onMomentumScrollEnd={() => patch({ scrollX: scrollX.current, scrollY: scrollY.current })}
            scrollEventThrottle={32}
            style={{ minHeight: scaledHeight }}
            contentContainerStyle={{ width: scaledWidth, minHeight: scaledHeight }}
          >
            <View style={{ width: scaledWidth, minHeight: scaledHeight }}>
              <View
                style={{
                  width: contentWidth,
                  minHeight: contentHeight,
                  transform: [{ scale: layout.zoom }],
                  transformOrigin: 'top left',
                }}
              >
                {children(panResponder.panHandlers)}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} style={[styles.toggle, { backgroundColor: active ? theme.green100 : theme.canvas, borderColor: active ? theme.green700 : theme.border }]}> 
      <View style={[styles.check, { backgroundColor: active ? theme.green700 : 'transparent', borderColor: active ? theme.green700 : theme.muted }]}><Text style={[styles.checkText, { color: contrastText(theme.green700) }]}>{active ? '✓' : ''}</Text></View>
      <Text style={[styles.toggleText, { color: theme.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, suffix, minimum, maximum, step, onChange }: { label: string; value: number; suffix: string; minimum: number; maximum: number; step: number; onChange: (value: number) => void }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: theme.canvas, borderColor: theme.border }]}> 
      <Text style={[styles.stepperLabel, { color: theme.ink }]}>{label}</Text>
      <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(minimum, value - step))} style={[styles.stepperButton, { backgroundColor: theme.surface }]}><Text style={[styles.stepperButtonText, { color: theme.ink }]}>−</Text></Pressable>
      <Text style={[styles.stepperValue, { color: theme.muted }]}>{value}{suffix}</Text>
      <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => onChange(Math.min(maximum, value + step))} style={[styles.stepperButton, { backgroundColor: theme.surface }]}><Text style={[styles.stepperButtonText, { color: theme.ink }]}>＋</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minHeight: 360 },
  toolbar: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  iconButton: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { fontSize: 18, fontWeight: '900' },
  zoomValue: { width: 48, textAlign: 'center', fontSize: 11, fontWeight: '900' },
  fitButton: { height: 34, paddingHorizontal: 11, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 10, fontWeight: '900' },
  panGrip: { flex: 1, minWidth: 120, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  panGripText: { fontSize: 10, fontWeight: '800' },
  customizeButton: { height: 34, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  customizeText: { fontSize: 10, fontWeight: '900' },
  customizePanel: { padding: 10, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  toggle: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  check: { width: 17, height: 17, marginRight: 7, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  toggleText: { fontSize: 10, fontWeight: '800' },
  stepper: { minHeight: 36, paddingLeft: 10, paddingRight: 4, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepperLabel: { fontSize: 10, fontWeight: '800' },
  stepperButton: { width: 27, height: 27, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontSize: 16, fontWeight: '900' },
  stepperValue: { minWidth: 38, textAlign: 'center', fontSize: 9, fontWeight: '900' },
  action: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 10, fontWeight: '900' },
  disabled: { opacity: 0.38 },
  scrollerFrame: { flex: 1, overflow: 'hidden' },
  scroller: { flex: 1 },
});
