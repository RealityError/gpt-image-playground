// Viewport transform utilities for pan/zoom in mask editor

export interface Point {
  x: number
  y: number
}

export interface ViewTransform {
  x: number
  y: number
  scale: number
}

interface Size {
  width: number
  height: number
}

/**
 * Clamp a view transform to keep the canvas reasonably visible.
 */
export function clampViewTransform(
  transform: ViewTransform,
  viewport: Size,
): ViewTransform {
  const minScale = 0.1
  const maxScale = 10
  const scale = Math.max(minScale, Math.min(maxScale, transform.scale))
  const maxPan = Math.max(viewport.width, viewport.height) * 2
  return {
    x: Math.max(-maxPan, Math.min(maxPan, transform.x)),
    y: Math.max(-maxPan, Math.min(maxPan, transform.y)),
    scale,
  }
}

/**
 * Convert a client-space point to canvas-space coordinates.
 * rect: canvas bounding rect
 * point: { x: clientX, y: clientY }
 * canvasSize: { width, height } of the canvas element
 */
export function clientPointToCanvasPoint(
  rect: DOMRect | { left: number; top: number; width: number; height: number },
  point: Point,
  canvasSize: Size,
): Point {
  const scaleX = canvasSize.width / rect.width
  const scaleY = canvasSize.height / rect.height
  return {
    x: (point.x - rect.left) * scaleX,
    y: (point.y - rect.top) * scaleY,
  }
}

/**
 * Compute an initial transform that fits the stage comfortably in the viewport.
 *
 * NOTE: In this app, the image `frame` already uses CSS `max-h-full max-w-full`
 * with the correct aspect-ratio, so the frame is always sized to fit the stage
 * before this function is called. We just return identity transform (scale=1,
 * no pan) so the canvas fills the frame naturally.
 */
export function getComfortableInitialTransform(
  _frame: Size,
  _stage: Size,
  _compact?: boolean,
): ViewTransform {
  return { x: 0, y: 0, scale: 1 }
}

/**
 * Compute a new transform from a pinch gesture.
 */
export function getPinchTransform(opts: {
  startTransform: ViewTransform
  startCentroid: Point
  nextCentroid: Point
  startDistance: number
  nextDistance: number
  viewportSize: Size
}): ViewTransform {
  const { startTransform, startCentroid, nextCentroid, startDistance, nextDistance } = opts
  const scaleRatio = nextDistance / startDistance
  const newScale = startTransform.scale * scaleRatio
  return {
    x: startTransform.x + (nextCentroid.x - startCentroid.x),
    y: startTransform.y + (nextCentroid.y - startCentroid.y),
    scale: newScale,
  }
}

/**
 * Zoom at a specific point in viewport-local coordinates.
 */
export function zoomAtPoint(
  transform: ViewTransform,
  point: Point,
  newScale: number,
  viewport: Size,
): ViewTransform {
  const ratio = newScale / transform.scale
  return {
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
    scale: newScale,
  }
}
