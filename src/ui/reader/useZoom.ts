import { useEffect, useRef, useState } from 'preact/hooks';

const MAX = 5;
const DOUBLE_MS = 280;

type Pt = { x: number; y: number };
type View = { s: number; x: number; y: number };

/**
 * Pellizco, doble toque (zoom 2.5×/1×), arrastre con zoom, deslizar y tocar,
 * con pointer events. Deslizar solo pasa de página sin zoom. `resetKey` vuelve a 1×.
 */
export function useZoom(opts: { onTap: (x: number, width: number) => void; onSwipe: (dx: number) => void; resetKey: unknown }) {
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const r = useRef({
    pts: new Map<number, Pt>(),
    start: null as null | (Pt & { v: View; t: number }),
    pinch: null as null | { d: number; v: View },
    multi: false,
    lastTap: null as null | (Pt & { t: number }),
    tapTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [opts.resetKey]);
  useEffect(() => () => clearTimeout(r.current.tapTimer || undefined), []);

  const dist = () => {
    const [a, b] = [...r.current.pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const clamp = (v: View, el: HTMLElement): View => {
    const s = Math.min(MAX, Math.max(1, v.s));
    const mx = ((s - 1) * el.clientWidth) / 2;
    const my = ((s - 1) * el.clientHeight) / 2;
    return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };

  const handlers = {
    onPointerDown(e: PointerEvent) {
      const st = r.current;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.pts.size === 1) {
        st.multi = false;
        st.start = { x: e.clientX, y: e.clientY, v: viewRef.current, t: Date.now() };
      } else if (st.pts.size === 2) {
        st.multi = true;
        st.pinch = { d: dist(), v: viewRef.current };
      }
    },
    onPointerMove(e: PointerEvent) {
      const st = r.current;
      if (!st.pts.has(e.pointerId)) return;
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const el = e.currentTarget as HTMLElement;
      if (st.pts.size === 2 && st.pinch) {
        const k = dist() / (st.pinch.d || 1);
        const v = st.pinch.v;
        setView(clamp({ s: v.s * k, x: v.x * k, y: v.y * k }, el));
      } else if (st.pts.size === 1 && st.start && !st.multi && st.start.v.s > 1) {
        setView(clamp({ ...st.start.v, x: st.start.v.x + e.clientX - st.start.x, y: st.start.v.y + e.clientY - st.start.y }, el));
      }
    },
    onPointerUp(e: PointerEvent) {
      const st = r.current;
      if (!st.pts.delete(e.pointerId)) return;
      if (st.pts.size === 1) st.pinch = null;
      if (st.pts.size > 0 || !st.start) return;
      const start = st.start;
      st.start = null;
      if (st.multi) return;
      const el = e.currentTarget as HTMLElement;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (start.v.s === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return optsRef.current.onSwipe(dx);
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
      const now = Date.now();
      const last = st.lastTap;
      if (last && now - last.t < DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
        clearTimeout(st.tapTimer || undefined);
        st.lastTap = null;
        const rect = el.getBoundingClientRect();
        const s = 2.5;
        setView(
          viewRef.current.s > 1
            ? { s: 1, x: 0, y: 0 }
            : clamp({ s, x: -(e.clientX - rect.left - rect.width / 2) * (s - 1), y: -(e.clientY - rect.top - rect.height / 2) * (s - 1) }, el),
        );
        return;
      }
      st.lastTap = { x: e.clientX, y: e.clientY, t: now };
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      st.tapTimer = setTimeout(() => optsRef.current.onTap(x, rect.width), DOUBLE_MS);
    },
    onPointerCancel(e: PointerEvent) {
      const st = r.current;
      st.pts.delete(e.pointerId);
      if (st.pts.size === 0) st.start = null;
    },
  };

  return { view, handlers, zoomed: view.s > 1 };
}
