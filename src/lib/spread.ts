/** Páginas visibles en `index`. En doble página: portada sola, después [1,2], [3,4]…; la última puede quedar sola. */
export function spreadAt(index: number, total: number, double: boolean): number[] {
  if (!double || index === 0) return [index];
  const first = index % 2 === 1 ? index : index - 1;
  return first + 1 < total ? [first, first + 1] : [first];
}

/** Primera página del pliego siguiente (delta 1) o anterior (delta -1), dentro del rango. */
export function step(index: number, total: number, double: boolean, delta: 1 | -1): number {
  const cur = spreadAt(index, total, double);
  if (delta === 1) {
    const next = cur[cur.length - 1] + 1;
    return next < total ? next : cur[0];
  }
  if (cur[0] === 0) return 0;
  return spreadAt(cur[0] - 1, total, double)[0];
}

export function tapZone(x: number, width: number, dir: 'rtl' | 'ltr'): 'next' | 'prev' | 'menu' {
  const r = x / width;
  if (r > 0.3 && r < 0.7) return 'menu';
  return (r <= 0.3) === (dir === 'rtl') ? 'next' : 'prev';
}
