const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function imageMime(path: string): string {
  return IMAGE_MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
}

export function isImageEntry(path: string): boolean {
  const parts = path.split(/[\\/]/);
  if (parts.includes('__MACOSX') || parts.some((p) => p.startsWith('.'))) return false;
  const name = parts[parts.length - 1];
  const dot = name.lastIndexOf('.');
  return dot > 0 && name.slice(dot + 1).toLowerCase() in IMAGE_MIME;
}
