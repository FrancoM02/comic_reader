import { useState } from 'preact/hooks';
import { extractPages, makeThumb } from '../extract';

export function DevExtract() {
  const [status, setStatus] = useState('Elegí un archivo');
  const [thumbs, setThumbs] = useState<string[]>([]);

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    setThumbs([]);
    setStatus('Extrayendo...');
    try {
      const { total, pages } = await extractPages(file);
      for await (const p of pages) {
        const url = URL.createObjectURL(await makeThumb(p.blob));
        setThumbs((t) => [...t, url]);
        setStatus(`${p.index + 1} / ${total} páginas`);
      }
      setStatus(`Listo: ${total} páginas`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div style="padding:16px">
      <input type="file" accept=".cbz,.zip,.cbr,.rar,.pdf" onChange={onFile} />
      <p>{status}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        {thumbs.map((u, i) => (
          <figure key={u} style="margin:0">
            <img src={u} width={120} />
            <figcaption>{i + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
