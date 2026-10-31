const KEY = 'cr.double';

export type DoublePref = 'auto' | 'nunca';

export function getDoublePref(): DoublePref {
  try {
    return localStorage.getItem(KEY) === 'nunca' ? 'nunca' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setDoublePref(v: DoublePref): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* sin almacenamiento: la preferencia no se guarda */
  }
}
