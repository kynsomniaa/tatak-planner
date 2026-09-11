import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderHandlers, LayoutChangeEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { contrastText, useAppTheme } from '../theme';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 1.6;
const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 20) / 20));

export interface MapFocusRequest {
  token: number;
  x: number;
  y: number;
  zoom?: number;
}

export function CurriculumMapViewport({ contentWidth, contentHeight, focus, dragging = false, children }: {
  contentWidth: number;
  contentHeight: number;
  focus?: MapFocusRequest;
  dragging?: boolean;
  children: (panHandlers: GestureResponderHandlers, panning: boolean) => ReactNode;
}) {
  const theme = useAppTheme();
  const horizontalRef = useRef<ScrollView>(null);
  const verticalRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  const scrollX = useRef(0);
  const scrollY = useRef(0);
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const webPan = useRef<{ pointerId: number; clientX: number; clientY: number; scrollX: number; scrollY: number; moved: boolean } | null>(null);
  const lastWheelAt = useRef(0);
  const [zoom, setZoom] = useState(0.72);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);

  const scrollTo = (x: number, y: number, animated = false) => {
    const nextX = Math.max(0, Math.min(Math.max(0, contentWidth * zoom - viewport.width), x));
    const nextY = Math.max(0, Math.min(Math.max(0, contentHeight * zoom - viewport.height), y));
    scrollX.current = nextX;
    scrollY.current = nextY;
    horizontalRef.current?.scrollTo({ x: nextX, animated });
    verticalRef.current?.scrollTo({ y: nextY, animated });
  };
  const applyZoom = (nextValue: number, pointX = viewport.width / 2, pointY = viewport.height / 2) => {
    const nextZoom = clampZoom(nextValue);
    if (nextZoom === zoom) return;
    const contentX = (scrollX.current + pointX) / zoom;
    const contentY = (scrollY.current + pointY) / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      const nextX = Math.max(0, Math.min(Math.max(0, contentWidth * nextZoom - viewport.width), contentX * nextZoom - pointX));
      const nextY = Math.max(0, Math.min(Math.max(0, contentHeight * nextZoom - viewport.height), contentY * nextZoom - pointY));
      scrollX.current = nextX;
      scrollY.current = nextY;
      horizontalRef.current?.scrollTo({ x: nextX, animated: false });
      verticalRef.current?.scrollTo({ y: nextY, animated: false });
    });
  };
  const fit = () => {
    const nextZoom = clampZoom(Math.min((viewport.width - 24) / contentWidth, (viewport.height - 24) / contentHeight));
    setZoom(nextZoom);
    scrollX.current = 0;
    scrollY.current = 0;
    horizontalRef.current?.scrollTo({ x: 0, animated: true });
    verticalRef.current?.scrollTo({ y: 0, animated: true });
  };

  const canPan = (event: unknown) => {
    if (Platform.OS !== 'web') return true;
    const native = (event as { nativeEvent?: { button?: number; buttons?: number; pointerType?: string; touches?: unknown[] } })?.nativeEvent;
    return native?.pointerType === 'touch' || Boolean(native?.touches?.length);
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => canPan(event),
    onStartShouldSetPanResponderCapture: (event) => canPan(event),
    onMoveShouldSetPanResponder: (event, gesture) => canPan(event) && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onMoveShouldSetPanResponderCapture: (event, gesture) => canPan(event) && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      panStartX.current = scrollX.current;
      panStartY.current = scrollY.current;
      setPanning(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const maxX = Math.max(0, contentWidth * zoom - viewport.width);
      const maxY = Math.max(0, contentHeight * zoom - viewport.height);
      const x = Math.max(0, Math.min(maxX, panStartX.current - gesture.dx));
      const y = Math.max(0, Math.min(maxY, panStartY.current - gesture.dy));
      scrollX.current = x;
      scrollY.current = y;
      horizontalRef.current?.scrollTo({ x, animated: false });
      verticalRef.current?.scrollTo({ y, animated: false });
    },
    onPanResponderRelease: () => setPanning(false),
    onPanResponderTerminate: () => setPanning(false),
  }), [contentHeight, contentWidth, viewport.height, viewport.width, zoom]);

  useEffect(() => {
    if (!focus || viewport.width === 0 || viewport.height === 0) return;
    const nextZoom = focus.zoom ?? Math.max(1, zoom);
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      const x = Math.max(0, Math.min(Math.max(0, contentWidth * nextZoom - viewport.width), focus.x * nextZoom - viewport.width / 2));
      const y = Math.max(0, Math.min(Math.max(0, contentHeight * nextZoom - viewport.height), focus.y * nextZoom - viewport.height / 2));
      scrollX.current = x;
      scrollY.current = y;
      horizontalRef.current?.scrollTo({ x, animated: true });
      verticalRef.current?.scrollTo({ y, animated: true });
    });
  }, [focus?.token, contentHeight, contentWidth, viewport.height, viewport.width]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = frameRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const isPanSurface = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('#curriculum-map-pan'));
    const contextMenu = (event: MouseEvent) => { if (isPanSurface(event.target)) event.preventDefault(); };
    const pointerDown = (event: PointerEvent) => {
      if (![0, 1, 2].includes(event.button) || !isPanSurface(event.target)) return;
      event.preventDefault();
      webPan.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, scrollX: scrollX.current, scrollY: scrollY.current, moved: false };
      node.setPointerCapture?.(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const active = webPan.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - active.clientX;
      const deltaY = event.clientY - active.clientY;
      if (!active.moved && Math.hypot(deltaX, deltaY) < 4) return;
      if (!active.moved) {
        active.moved = true;
        setPanning(true);
      }
      event.preventDefault();
      scrollTo(active.scrollX - deltaX, active.scrollY - deltaY);
    };
    const pointerUp = (event: PointerEvent) => {
      if (webPan.current?.pointerId !== event.pointerId) return;
      webPan.current = null;
      node.releasePointerCapture?.(event.pointerId);
      setPanning(false);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const now = Date.now();
        if (now - lastWheelAt.current < 30 || event.deltaY === 0) return;
        lastWheelAt.current = now;
        const bounds = node.getBoundingClientRect();
        applyZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX - bounds.left, event.clientY - bounds.top);
        return;
      }
      event.preventDefault();
      if (event.shiftKey) scrollTo(scrollX.current + event.deltaY + event.deltaX, scrollY.current);
      else scrollTo(scrollX.current + event.deltaX, scrollY.current + event.deltaY);
    };
    node.addEventListener('contextmenu', contextMenu);
    node.addEventListener('pointerdown', pointerDown);
    node.addEventListener('pointermove', pointerMove);
    node.addEventListener('pointerup', pointerUp);
    node.addEventListener('pointercancel', pointerUp);
    node.addEventListener('wheel', wheel, { passive: false });
    return () => {
      node.removeEventListener('contextmenu', contextMenu);
      node.removeEventListener('pointerdown', pointerDown);
      node.removeEventListener('pointermove', pointerMove);
      node.removeEventListener('pointerup', pointerUp);
      node.removeEventListener('pointercancel', pointerUp);
      node.removeEventListener('wheel', wheel);
    };
  }, [contentHeight, contentWidth, viewport.height, viewport.width, zoom]);

  const scaledWidth = Math.max(viewport.width, contentWidth * zoom);
  const scaledHeight = Math.max(viewport.height, contentHeight * zoom);
  const centeredOffsetX = Math.max(0, (viewport.width - contentWidth * zoom) / 2) / zoom;
  const centeredOffsetY = Math.max(0, (viewport.height - contentHeight * zoom) / 2) / zoom;
  return (
    <View style={[styles.wrapper, dragging && styles.wrapperDragging]}>
      <View style={[styles.controls, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.handHint, { color: panning ? theme.green700 : theme.muted }]}>{panning ? '✋ Roaming map…' : 'Drag empty space to roam · Ctrl/⌘ + wheel to zoom'}</Text>
        <Pressable onPress={() => applyZoom(zoom - 0.1)} style={[styles.control, { backgroundColor: theme.canvas }]}><Text style={[styles.controlText, { color: theme.ink }]}>−</Text></Pressable>
        <Text style={[styles.zoom, { color: theme.ink }]}>{Math.round(zoom * 100)}%</Text>
        <Pressable onPress={() => applyZoom(zoom + 0.1)} style={[styles.control, { backgroundColor: theme.canvas }]}><Text style={[styles.controlText, { color: theme.ink }]}>＋</Text></Pressable>
        <Pressable onPress={fit} style={[styles.fit, { backgroundColor: theme.green100 }]}><Text style={[styles.fitText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>Fit map</Text></Pressable>
      </View>
      <View ref={frameRef} style={[styles.frame, { cursor: panning ? 'grabbing' : 'grab' } as never, dragging && styles.frameDragging]} onLayout={(event: LayoutChangeEvent) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
        <ScrollView style={dragging && styles.frameDragging} ref={verticalRef} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ minHeight: scaledHeight }} onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}>
          <ScrollView style={dragging && styles.frameDragging} ref={horizontalRef} horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ width: scaledWidth, minHeight: scaledHeight }} onScroll={(event) => { scrollX.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}>
            <View style={{ width: scaledWidth, minHeight: scaledHeight }}>
              <View style={{ width: contentWidth, height: contentHeight, marginLeft: centeredOffsetX, marginTop: centeredOffsetY, transform: [{ scale: zoom }], transformOrigin: 'top left' }}>
                {children(panResponder.panHandlers, panning)}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minWidth: 0 },
  wrapperDragging: { zIndex: 500, elevation: 500, overflow: 'visible' },
  controls: { minHeight: 48, paddingHorizontal: 10, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  handHint: { flex: 1, fontSize: 9, fontWeight: '800' },
  control: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 17, fontWeight: '900' },
  zoom: { width: 45, textAlign: 'center', fontSize: 9, fontWeight: '900' },
  fit: { minHeight: 32, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 9, fontWeight: '900' },
  frame: { flex: 1, overflow: 'hidden' },
  frameDragging: { overflow: 'visible' },
});
