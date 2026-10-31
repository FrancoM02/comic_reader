import { useEffect, useState } from 'preact/hooks';
import { parseFilename } from '../lib/filename';
import { setBusy, signIn, tokenMinutesLeft, usesRedirect } from '../auth';
import { makeVolumeLabel, volumeName } from '../lib/library-view';
import { useSession } from '../session';
import type { Library, SeriesKind } from '../types';
import { SessionExpiredError, findDuplicate, uploadVolume } from '../upload';
import { IconClose, IconPencil, IconUpload } from './icons';
import { LIBRARY_CHANGED } from './shared';
import { useDialog, type DialogOpts, type DialogResult } from './kit';

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
  open: boolean;
}

let seq = 0;
const toRow = (file: File): Row => {
  const p = parseFilename(file.name);
  return { key: ++seq, file, series: p.series, number: p.number === null ? '' : String(p.number), label: p.label, kind: 'manga', status: 'pendiente', done: 0, total: 0, open: !p.series.trim() };
};

/*
 * La cola vive fuera del componente: si te vas a otra pantalla, la subida sigue y al volver se ve el progreso.
 * Lo único que necesita la pantalla montada es la pregunta de tomo duplicado (queda en `question` hasta que vuelvas).
 */
interface Question {
  opts: DialogOpts;
  resolve: (r: DialogResult) => void;
}
let q = { rows: [] as Row[], running: false, run: { cur: 0, total: 0 }, question: null as Question | null };
const subs = new Set<() => void>();
function setQ(p: Partial<typeof q>) {
  q = { ...q, ...p };
  subs.forEach((f) => f());
}
const setRows = (f: (rs: Row[]) => Row[]) => setQ({ rows: f(q.rows) });
const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
const askQ = (opts: DialogOpts) => new Promise<DialogResult>((resolve) => setQ({ question: { opts, resolve } }));
const preventUnload = (e: BeforeUnloadEvent) => e.preventDefault();
/** Solo para tests: vacía la cola entre casos. */
export function resetUploadQueue(): void {
  q = { rows: [], running: false, run: { cur: 0, total: 0 }, question: null };
}

export function UploadView({ cleaned = [] }: { cleaned?: string[] }) {
  const session = useSession();
  const [lib, setLib] = useState<Library | null>(null);
  const [, rerender] = useState(0);
  const [dialog, ask] = useDialog();
  const { rows, running, run, question } = q;

  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);

  useEffect(() => {
    session.store.loadLibrary().then(setLib, () => {});
  }, [session]);

  useEffect(() => {
    if (!question) return;
    ask(question.opts).then((r) => {
      if (q.question !== question) return;
      setQ({ question: null });
      question.resolve(r);
    });
  }, [question]);

  const add = (files: FileList | File[] | null) => files && setRows((rs) => [...rs, ...Array.from(files).map(toRow)]);
  const findSeries = (lb: Library, name: string) => lb.series.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function subir() {
    setQ({ running: true });
    addEventListener('beforeunload', preventUnload);
    setBusy(true); // por lote: entre tomo y tomo tampoco debe renovarse por redirección
    try {
      // Corre dentro del clic: si el token vence pronto, renovarlo ahora (un toque) y no a mitad de la subida.
      // Con redirección no se puede (navegar pierde los archivos elegidos): se sigue con el token actual.
      if (!usesRedirect() && tokenMinutesLeft() < 30) await signIn().catch(() => {});
      let cur = 0;
      const total = rows.filter((r) => r.status !== 'listo').length;
      for (const r of rows) {
        if (r.status === 'listo') continue;
        setQ({ run: { cur: ++cur, total } });
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
          const a =
            (
              await askQ({
                title: 'Tomo duplicado',
                message: `Ya tenés el tomo ${r.number} de ${r.series}.`,
                actions: [
                  { label: 'Reemplazar', value: 'replace', kind: 'primary' },
                  { label: 'Subir igual', value: 'keep' },
                ],
              })
            ).action ?? 'cancel';
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
          dispatchEvent(new Event(LIBRARY_CHANGED)); // la biblioteca, si está abierta, muestra el tomo nuevo
        } catch (e) {
          patch(r.key, { status: 'error', error: (e instanceof Error && e.message) || 'Error desconocido' });
          if (e instanceof SessionExpiredError) break;
        }
      }
      setLib(await session.store.loadLibrary());
    } finally {
      setBusy(false);
      removeEventListener('beforeunload', preventUnload);
      setQ({ running: false });
    }
  }

  const pending = rows.filter((r) => r.status !== 'listo').length;
  const label = running
    ? `Subiendo ${run.cur} de ${run.total}…`
    : `Subir ${pending} ${pending === 1 ? 'archivo' : 'archivos'}`;

  return (
    <main
      class="screen"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer?.files ?? null);
      }}
    >
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Volver">
          <IconClose />
        </a>
        <h1>Subir</h1>
      </header>
      {running && <p class="notice">Podés ir a otra pantalla: la subida sigue. No cierres la pestaña.</p>}
      {cleaned.filter((n) => !rows.some((r) => r.file.name === n)).map((n) => (
        <p role="alert" class="notice" key={n}>
          La subida de {n} se cortó, elegí el archivo de nuevo
        </p>
      ))}
      <label class="dropzone">
        <IconUpload size={28} />
        <strong>Tocá para elegir archivos</strong>
        <span>o arrastralos acá · CBZ, CBR, PDF</span>
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
      <ul class="up-list">
        {rows.map((r) => {
          const existing = lib && findSeries(lib, r.series);
          const isNew = !existing;
          const dis = running || r.status === 'listo';
          const num = r.number.trim() === '' ? null : Number(r.number);
          const tomo = num !== null && Number.isNaN(num) ? 'Número no válido' : volumeName(makeVolumeLabel(num, r.label, existing?.kind ?? r.kind));
          return (
            <li key={r.key} class="card up-card">
              <div class="up-head">
                <div class="up-info">
                  <div class="up-title">
                    {r.series.trim() ? <span class="ellipsis">{r.series}</span> : <span class="up-missing">Sin serie</span>}
                    {isNew && r.series.trim() !== '' && <span class="tag">nueva</span>}
                  </div>
                  <div class="up-sub">
                    {tomo}
                    {isNew && ` · ${r.kind === 'manga' ? 'Manga' : 'Cómic'}`}
                  </div>
                  <div class="up-file ellipsis">{r.file.name}</div>
                </div>
                <span class={r.status === 'listo' ? 'up-state ok' : 'up-state'}>
                  {r.status === 'listo' ? 'Listo' : r.status === 'subiendo' ? `${r.done}/${r.total} pág.` : ''}
                </span>
                <button type="button" class="icon-btn" aria-label={`Editar ${r.file.name}`} aria-expanded={r.open} disabled={dis} onClick={() => patch(r.key, { open: !r.open })}>
                  <IconPencil size={20} />
                </button>
              </div>
              {r.open && (
                <div class="up-fields">
                  <label>
                    Serie
                    <input list="series-list" value={r.series} disabled={dis} onInput={(e) => patch(r.key, { series: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label>
                    Número
                    <input type="number" step="any" value={r.number} disabled={dis} onInput={(e) => patch(r.key, { number: (e.target as HTMLInputElement).value })} />
                  </label>
                  {isNew && (
                    <label>
                      Tipo
                      <select value={r.kind} disabled={dis} onChange={(e) => patch(r.key, { kind: (e.target as HTMLSelectElement).value as SeriesKind })}>
                        <option value="manga">Manga</option>
                        <option value="comic">Cómic</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
              {r.status === 'subiendo' && (
                <div class="bar">
                  <span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                </div>
              )}
              {r.error && (
                <p role="alert" class="notice">
                  {r.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {pending > 0 && (
        <div class="up-bar">
          <button type="button" class="btn primary" disabled={running || rows.some((r) => !r.series.trim())} onClick={subir}>
            {label}
          </button>
        </div>
      )}
      {dialog}
    </main>
  );
}
