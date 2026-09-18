import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderHandlers, LayoutChangeEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cameraForWorldRect, clampMapCamera, MapCameraState } from '../domain/mapCamera';
import { contrastText, useAppTheme } from '../theme';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 1.6;
const clampExactZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 20) / 20));

export interface MapFocusRequest {
  token: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zoom?: number;
  camera?: MapCameraState;
}

export function CurriculumMapViewport({ contentWidth, contentHeight, focus, dragging = false, onCameraChange, children }: {
  contentWidth: number;
  contentHeight: number;
  focus?: MapFocusRequest;
  dragging?: boolean;
  onCameraChange?: (camera: MapCameraState) => void;
  children: (panHandlers: GestureResponderHandlers, panning: boolean) => ReactNode;
}) {
  const theme = useAppTheme();
  const horizontalRef = useRef<ScrollView>(null);
  const verticalRef = useRef<ScrollView>(null);
  const wrapperRef = useRef<View>(null);
  const frameRef = useRef<View>(null);
  const scrollX = useRef(0);
  const scrollY = useRef(0);
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const webPan = useRef<{ pointerId: number; clientX: number; clientY: number; scrollX: number; scrollY: number; moved: boolean } | null>(null);
  const pendingFocus = useRef<{ request: MapFocusRequest; zoom: number } | null>(null);
  const handledFocusToken = useRef<number | null>(null);
  const onCameraChangeRef = useRef(onCameraChange);
  const lastWheelAt = useRef(0);
  const [zoom, setZoom] = useState(0.72);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => { onCameraChangeRef.current = onCameraChange; }, [onCameraChange]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      // Browsers exit native fullscreen themselves. This also closes the CSS
      // fallback used by embedded/local preview browsers.
      if (event.key === 'Escape' && fullscreen) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreen]);

  const reportCamera = (cameraZoom = zoom, panX = scrollX.current, panY = scrollY.current) => {
    onCameraChangeRef.current?.({ zoom: cameraZoom, panX, panY });
  };

  const scrollTo = (x: number, y: number, animated = false) => {
    const nextX = Math.max(0, Math.min(Math.max(0, contentWidth * zoom - viewport.width), x));
    const nextY = Math.max(0, Math.min(Math.max(0, contentHeight * zoom - viewport.height), y));
    scrollX.current = nextX;
    scrollY.current = nextY;
    horizontalRef.current?.scrollTo({ x: nextX, animated });
    verticalRef.current?.scrollTo({ y: nextY, animated });
    reportCamera(zoom, nextX, nextY);
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
      reportCamera(nextZoom, nextX, nextY);
    });
  };
  const fit = () => {
    const nextZoom = clampZoom(Math.min((viewport.width - 24) / contentWidth, (viewport.height - 24) / contentHeight));
    setZoom(nextZoom);
    scrollX.current = 0;
    scrollY.current = 0;
    horizontalRef.current?.scrollTo({ x: 0, animated: true });
    verticalRef.current?.scrollTo({ y: 0, animated: true });
    reportCamera(nextZoom, 0, 0);
  };
  const toggleFullscreen = async () => {
    if (Platform.OS !== 'web') {
      setFullscreen((value) => !value);
      return;
    }
    const node = wrapperRef.current as unknown as HTMLElement | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (node?.requestFullscreen) await node.requestFullscreen();
      else setFullscreen((value) => !value);
    } catch {
      setFullscreen((value) => !value);
    }
  };

  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) return;
    requestAnimationFrame(() => {
      const maxX = Math.max(0, contentWidth * zoom - viewport.width);
      const maxY = Math.max(0, contentHeight * zoom - viewport.height);
      const x = Math.max(0, Math.min(maxX, scrollX.current));
      const y = Math.max(0, Math.min(maxY, scrollY.current));
      horizontalRef.current?.scrollTo({ x, animated: false });
      verticalRef.current?.scrollTo({ y, animated: false });
      reportCamera(zoom, x, y);
    });
  }, [fullscreen, viewport.width, viewport.height]);

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
    if (handledFocusToken.current === focus.token) return;
    handledFocusToken.current = focus.token;
    const nextZoom = clampExactZoom(focus.camera?.zoom ?? focus.zoom ?? Math.max(1, zoom));
    pendingFocus.current = { request: focus, zoom: nextZoom };
    if (nextZoom !== zoom) setZoom(nextZoom);
  }, [focus?.token, contentHeight, contentWidth, viewport.height, viewport.width]);

  // Run after the zoomed scroll surface has committed. Scrolling during the
  // render that changes zoom lets the browser clamp against the previous size,
  // which caused the course locator to miss its target at non-100% scales.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.zoom !== zoom || viewport.width === 0 || viewport.height === 0) return;
    pendingFocus.current = null;
    const content = { width: contentWidth, height: contentHeight };
    const visible = { width: viewport.width, height: viewport.height };
    const camera = pending.request.camera
      ? clampMapCamera({ ...pending.request.camera, zoom }, content, visible)
      : cameraForWorldRect({
        x: pending.request.x ?? 0,
        y: pending.request.y ?? 0,
        width: pending.request.width ?? 0,
        height: pending.request.height ?? 0,
      }, zoom, content, visible);
    requestAnimationFrame(() => {
      scrollX.current = camera.panX;
      scrollY.current = camera.panY;
      horizontalRef.current?.scrollTo({ x: camera.panX, animated: true });
      verticalRef.current?.scrollTo({ y: camera.panY, animated: true });
      reportCamera(camera.zoom, camera.panX, camera.panY);
    });
  }, [zoom, focus?.token, contentHeight, contentWidth, viewport.height, viewport.width]);

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
  // CSS transforms do not scale layout offsets. Keep the centering offset in
  // viewport pixels and absolutely position the transformed map inside the
  // explicitly sized scroll surface. Dividing these values by `zoom` pushes a
  // fitted (sub-100%) map far outside of the visible viewport on web.
  const centeredOffsetX = Math.max(0, (viewport.width - contentWidth * zoom) / 2);
  const centeredOffsetY = Math.max(0, (viewport.height - contentHeight * zoom) / 2);
  return (
    <View ref={wrapperRef} style={[styles.wrapper, { backgroundColor: theme.canvas }, fullscreen && styles.fullscreen, dragging && styles.wrapperDragging]}>
      <View nativeID="tour-map-controls" style={[styles.controls, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.handHint, { color: panning ? theme.green700 : theme.muted }]}>{panning ? '✋ Roaming map…' : 'Drag empty space to roam · Ctrl/⌘ + wheel to zoom'}</Text>
        <Pressable onPress={() => applyZoom(zoom - 0.1)} style={[styles.control, { backgroundColor: theme.canvas }]}><Text style={[styles.controlText, { color: theme.ink }]}>−</Text></Pressable>
        <Text style={[styles.zoom, { color: theme.ink }]}>{Math.round(zoom * 100)}%</Text>
        <Pressable onPress={() => applyZoom(zoom + 0.1)} style={[styles.control, { backgroundColor: theme.canvas }]}><Text style={[styles.controlText, { color: theme.ink }]}>＋</Text></Pressable>
        <Pressable onPress={fit} style={[styles.fit, { backgroundColor: theme.green100 }]}><Text style={[styles.fitText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>Fit map</Text></Pressable>
        <Pressable accessibilityLabel={fullscreen ? 'Exit Full Screen' : 'Full Screen'} onPress={() => { void toggleFullscreen(); }} style={[styles.fullscreenButton, { backgroundColor: fullscreen ? theme.gold : theme.green900 }]}><Text style={[styles.fullscreenText, { color: fullscreen ? contrastText(theme.gold) : contrastText(theme.green900) }]}>{fullscreen ? '↙ Exit Full Screen' : '⛶ Full Screen'}</Text></Pressable>
      </View>
      <View ref={frameRef} style={[styles.frame, { cursor: panning ? 'grabbing' : 'grab' } as never, dragging && styles.frameDragging]} onLayout={(event: LayoutChangeEvent) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
        <ScrollView style={dragging && styles.frameDragging} ref={verticalRef} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ minHeight: scaledHeight }} onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; reportCamera(zoom, scrollX.current, scrollY.current); }} scrollEventThrottle={32}>
          <ScrollView style={dragging && styles.frameDragging} ref={horizontalRef} horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ width: scaledWidth, minHeight: scaledHeight }} onScroll={(event) => { scrollX.current = event.nativeEvent.contentOffset.x; reportCamera(zoom, scrollX.current, scrollY.current); }} scrollEventThrottle={32}>
            <View style={{ width: scaledWidth, minHeight: scaledHeight }}>
              <View style={{ position: 'absolute', left: centeredOffsetX, top: centeredOffsetY, width: contentWidth, height: contentHeight, transform: [{ scale: zoom }], transformOrigin: 'top left' }}>
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
  fullscreen: { position: 'fixed' as never, left: 0, right: 0, top: 0, bottom: 0, zIndex: 10000, elevation: 10000 },
  wrapperDragging: { zIndex: 500, elevation: 500, overflow: 'visible' },
  controls: { minHeight: 48, paddingHorizontal: 10, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  handHint: { flex: 1, fontSize: 9, fontWeight: '800' },
  control: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 17, fontWeight: '900' },
  zoom: { width: 45, textAlign: 'center', fontSize: 9, fontWeight: '900' },
  fit: { minHeight: 32, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 9, fontWeight: '900' },
  fullscreenButton: { minHeight: 32, paddingHorizontal: 11, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fullscreenText: { fontSize: 9, fontWeight: '900' },
  frame: { flex: 1, overflow: 'hidden' },
  frameDragging: { overflow: 'visible' },
});
