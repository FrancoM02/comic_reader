import { useEffect, useState } from 'preact/hooks';
import { parseFilename } from '../lib/filename';
import { setBusy, signIn, tokenMinutesLeft, usesRedirect } from '../auth';
import { makeVolumeLabel } from '../lib/library-view';
import { useSession } from '../session';
import type { Library, SeriesKind } from '../types';
import { SessionExpiredError, findDuplicate, uploadVolume } from '../upload';

interface Row {
  key: number;
  file: File;
  series: string;
  number: string;
  label: string;
  kind: SeriesKind;
  status: 'pendiente' | 'subiendo' | 'listo' | 'error';
  done: number;
  total: number;
  error?: string;
}

let seq = 0;
const toRow = (file: File): Row => {
  const p = parseFilename(file.name);
  return { key: ++seq, file, series: p.series, number: p.number === null ? '' : String(p.number), label: p.label, kind: 'manga', status: 'pendiente', done: 0, total: 0 };
};

export function UploadView({ cleaned = [] }: { cleaned?: string[] }) {
  const session = useSession();
  const [lib, setLib] = useState<Library | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [dup, setDup] = useState<{ row: Row; resolve: (a: 'replace' | 'keep' | 'cancel') => void } | null>(null);

  useEffect(() => {
    session.store.loadLibrary().then(setLib, () => {});
  }, [session]);

  useEffect(() => {
    if (!running) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', f);
    return () => removeEventListener('beforeunload', f);
  }, [running]);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = (files: FileList | File[] | null) => files && setRows((rs) => [...rs, ...Array.from(files).map(toRow)]);
  const findSeries = (lb: Library, name: string) => lb.series.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function subir() {
    setRunning(true);
    setBusy(true); // por lote: entre tomo y tomo tampoco debe renovarse por redirección
    try {
      // Corre dentro del clic: si el token vence pronto, renovarlo ahora (un toque) y no a mitad de la subida.
      // Con redirección no se puede (navegar pierde los archivos elegidos): se sigue con el token actual.
      if (!usesRedirect() && tokenMinutesLeft() < 30) await signIn().catch(() => {});
      for (const r of rows) {
        if (r.status === 'listo') continue;
        const current = await session.store.loadLibrary();
        const existing = findSeries(current, r.series);
        const number = r.number.trim() === '' ? null : Number(r.number);
        if (number !== null && Number.isNaN(number)) {
          patch(r.key, { status: 'error', error: 'El número no es válido' });
          continue;
        }
        const seriesId = existing?.id ?? crypto.randomUUID();
        let replaceVolumeId: string | undefined;
        const d = existing && findDuplicate(current, existing.id, number);
        if (d) {
          const a = await new Promise<'replace' | 'keep' | 'cancel'>((resolve) => setDup({ row: r, resolve }));
          setDup(null);
          if (a === 'cancel') {
            patch(r.key, { status: 'pendiente' });
            continue;
          }
          if (a === 'replace') replaceVolumeId = d.id;
        }
        patch(r.key, { status: 'subiendo', error: undefined });
        try {
          await uploadVolume(
            {
              file: r.file,
              seriesId,
              newSeries: existing ? undefined : { name: r.series.trim(), kind: r.kind },
              number,
              // El número pudo cambiar en esta pantalla: la etiqueta sale de él, no del nombre del archivo.
              label: makeVolumeLabel(number, r.label, existing?.kind ?? r.kind),
              replaceVolumeId,
            },
            session,
            (done, total) => patch(r.key, { done, total }),
          );
          patch(r.key, { status: 'listo' });
        } catch (e) {
          patch(r.key, { status: 'error', error: e instanceof Error ? e.message : 'Error desconocido' });
          if (e instanceof SessionExpiredError) break;
        }
      }
      setLib(await session.store.loadLibrary());
    } finally {
      setBusy(false);
      setRunning(false);
    }
  }

  return (
    <main
      class="upload"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer?.files ?? null);
      }}
    >
      <h1>Subir</h1>
      <p>
        {running ? <span>Volver (esperá a que termine la subida)</span> : <a href="#/">Volver</a>}
      </p>
      {cleaned.map((n) => (
        <p role="alert" key={n}>
          La subida de {n} se cortó, elegí el archivo de nuevo
        </p>
      ))}
      <label>
        Elegí archivos o arrastralos acá{' '}
        <input
          type="file"
          multiple
          accept=".cbz,.cbr,.zip,.rar,.pdf"
          disabled={running}
          onChange={(e) => {
            const el = e.target as HTMLInputElement;
            add(el.files);
            el.value = '';
          }}
        />
      </label>
      <datalist id="series-list">
        {lib?.series.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
      {rows.map((r) => {
        const isNew = lib ? !findSeries(lib, r.series) : true;
        const dis = running || r.status === 'listo';
        return (
          <fieldset key={r.key}>
            <legend>{r.file.name}</legend>
            <label>
              Serie <input list="series-list" value={r.series} disabled={dis} onInput={(e) => patch(r.key, { series: (e.target as HTMLInputElement).value })} />
            </label>{' '}
            <label>
              Número <input type="number" step="any" value={r.number} disabled={dis} onInput={(e) => patch(r.key, { number: (e.target as HTMLInputElement).value })} />
            </label>
            {isNew && (
              <label>
                {' '}
                Tipo{' '}
                <select value={r.kind} disabled={dis} onChange={(e) => patch(r.key, { kind: (e.target as HTMLSelectElement).value as SeriesKind })}>
                  <option value="manga">Manga</option>
                  <option value="comic">Cómic</option>
                </select>
              </label>
            )}
            {r.status === 'subiendo' && <progress max={r.total || 1} value={r.done} />}
            {r.status === 'listo' && <p>Listo</p>}
            {r.error && <p role="alert">{r.error}</p>}
          </fieldset>
        );
      })}
      {rows.some((r) => r.status !== 'listo') && (
        <button type="button" disabled={running || rows.some((r) => !r.series.trim())} onClick={subir}>
          {running ? 'Subiendo…' : 'Subir'}
        </button>
      )}
      {dup && (
        <div role="dialog" aria-label="Duplicado">
          <p>
            Ya tenés el tomo {dup.row.number} de {dup.row.series}.
          </p>
          <button type="button" onClick={() => dup.resolve('replace')}>Reemplazar</button>{' '}
          <button type="button" onClick={() => dup.resolve('keep')}>Subir igual</button>{' '}
          <button type="button" onClick={() => dup.resolve('cancel')}>Cancelar</button>
        </div>
      )}
    </main>
  );
}
