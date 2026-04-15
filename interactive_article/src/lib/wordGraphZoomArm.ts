/**
 * Shared d3-zoom filter: wheel/pan only after the chart is “armed” (click), so page scroll
 * isn’t captured when the pointer merely passes over an embedded word graph.
 */

/** `event.target` is sometimes a Text node (no `.closest`). */
export function zoomFilterTargetElement(event: Event): Element | null {
  const t = event.target;
  if (t instanceof Element) return t;
  if (t instanceof Text) return t.parentElement;
  return null;
}

/** When `chartZoomArmed` is false, wheel never starts zoom and background drag never pans. */
export function wordGraphZoomEventFilter(event: Event, chartZoomArmed: boolean): boolean {
  const e = event as MouseEvent;
  if (!chartZoomArmed) {
    if (e.type === 'wheel') return false;
    const el = zoomFilterTargetElement(event);
    if (el?.closest?.('.node')) return false;
    if (el?.closest?.('.link')) return false;
    return false;
  }
  if (e.type !== 'wheel') {
    const el = zoomFilterTargetElement(event);
    if (el?.closest?.('.node')) return false;
    if (el?.closest?.('.link')) return false;
  }
  return (!e.ctrlKey || event.type === 'wheel') && !e.button;
}
