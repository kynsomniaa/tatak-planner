export interface MapCameraState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface MapViewportSize {
  width: number;
  height: number;
}

export interface MapWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, maximum: number) => Math.max(0, Math.min(Math.max(0, maximum), value));

/** Keeps a stored camera valid when the map or viewport dimensions change. */
export function clampMapCamera(
  camera: MapCameraState,
  content: MapViewportSize,
  viewport: MapViewportSize,
): MapCameraState {
  return {
    zoom: camera.zoom,
    panX: clamp(camera.panX, content.width * camera.zoom - viewport.width),
    panY: clamp(camera.panY, content.height * camera.zoom - viewport.height),
  };
}

/**
 * Converts a world-space course rectangle into a centered scroll camera.
 * Every value remains in world space until the final multiplication by zoom.
 */
export function cameraForWorldRect(
  target: MapWorldRect,
  zoom: number,
  content: MapViewportSize,
  viewport: MapViewportSize,
): MapCameraState {
  const worldCenterX = target.x + target.width / 2;
  const worldCenterY = target.y + target.height / 2;
  return clampMapCamera({
    zoom,
    panX: worldCenterX * zoom - viewport.width / 2,
    panY: worldCenterY * zoom - viewport.height / 2,
  }, content, viewport);
}

/** Raid locating zooms in when needed while respecting an already closer view. */
export function raidLocateZoom(currentZoom: number): number {
  return Math.max(1, Math.min(1.5, currentZoom));
}
