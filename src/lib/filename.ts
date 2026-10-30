export type ParsedFilename = {
  series: string;
  number: number | null;
  label: string;
  kind: 'volume' | 'issue' | null;
};

const pad = (int: string, width: number) => int.padStart(width, '0');

function makeLabel(prefix: string, raw: string, width: number): string {
  const [int, dec] = raw.split('.');
  return prefix + pad(int, width) + (dec !== undefined ? `.${dec}` : '');
}

export function parseFilename(name: string): ParsedFilename {
  const cleaned = name
    .replace(/\.(?:cbz|cbr|zip|rar|pdf)$/i, '') // extension
    .replace(/\[[^\]]*\]/g, ' ') // [tags]
    .replace(/_/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // dots, except decimal point
    .replace(/\s+/g, ' ')
    .trim();

  // Peel trailing "(...)" groups (year, "Digital"...) before looking for the number.
  const core = cleaned.replace(/(?:\s*\([^)]*\))+$/, '');
  const tidy = (x: string) => x.replace(/[\s\-–—:,]+$/, '').trim();

  let m = core.match(/^(.*?)\s*(?:^|\s)(?:vol|v|tomo|t)\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    return { series: tidy(m[1]), number: parseFloat(m[2]), label: makeLabel('v', m[2], 2), kind: 'volume' };
  }
  m = core.match(/^(.*?)\s*(?:^|\s)(?:#|c)\s*(\d+(?:\.\d+)?)$/i) ?? core.match(/^(.*\S)\s+(\d+)$/);
  if (m) {
    return { series: tidy(m[1]), number: parseFloat(m[2]), label: makeLabel('#', m[2], 3), kind: 'issue' };
  }
  return { series: cleaned, number: null, label: '', kind: null };
}
