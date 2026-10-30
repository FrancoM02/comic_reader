import { useState } from 'preact/hooks';
import { makeVolumeLabel, sortVolumes, volumeState } from '../lib/library-view';
import { useSession } from '../session';
import { getDeviceId } from '../store';
import type { Series, Volume } from '../types';
import { deleteSeries, deleteVolume } from '../upload';
import { Thumb, useLibraryData } from './shared';

const STATE = { unread: 'Sin leer', reading: 'Leyendo', read: 'Leído' };

export function SeriesView({ id }: { id: string }) {
  const session = useSession();
  const { store } = session;
  const { lib, prog, error, reload } = useLibraryData();
  const [msg, setMsg] = useState('');
  const series = lib?.series.find((s) => s.id === id);

  async function run(fn: () => Promise<unknown>) {
    setMsg('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg(`No se pudo guardar: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  }
  const patchSeries = (p: Partial<Series>) =>
    run(() => store.updateLibrary((l) => ({ ...l, series: l.series.map((s) => (s.id === id ? { ...s, ...p } : s)) })));
  const patchVolume = (vid: string, f: (v: Volume, l: NonNullable<typeof lib>) => Volume) =>
    run(() => store.updateLibrary((l) => ({ ...l, volumes: l.volumes.map((v) => (v.id === vid ? f(v, l) : v)) })));

  if (!lib) return <main class="home"><a href="#/">← Biblioteca</a>{error ? <p role="alert">{error}</p> : <p>Cargando…</p>}</main>;
  if (!series) return <main class="home"><a href="#/">← Biblioteca</a><p>Esa serie no existe.</p></main>;

  const volumes = sortVolumes(lib.volumes.filter((v) => v.seriesId === id));

  const rename = () => {
    const n = prompt('Nuevo nombre', series.name)?.trim();
    if (n) patchSeries({ name: n });
  };
  const setKind = (kind: Series['kind']) => patchSeries({ kind, dir: kind === 'manga' ? 'rtl' : 'ltr' });
  const delSeries = () =>
    confirm(`¿Borrar la serie "${series.name}" y sus ${volumes.length} tomos? No se puede deshacer.`) &&
    run(async () => {
      await deleteSeries(id, session);
      location.hash = '#/';
    });
  const setNumber = (v: Volume) => {
    const raw = prompt('Número del tomo (vacío = sin número)', v.number === null ? '' : String(v.number));
    if (raw === null) return;
    const number = raw.trim() === '' ? null : Number(raw);
    if (number !== null && Number.isNaN(number)) return setMsg('El número no es válido');
    patchVolume(v.id, (x) => ({ ...x, number, label: makeVolumeLabel(number, x.label, series.kind) }));
  };
  const move = (v: Volume, seriesId: string) => patchVolume(v.id, (x) => ({ ...x, seriesId }));
  const markRead = (v: Volume) =>
    run(async () =>
      store.saveProgress(v.id, {
        maxPage: v.pageCount - 1,
        totalPages: v.pageCount,
        finished: true,
        resetGen: (await store.loadProgress()).volumes[v.id]?.resetGen ?? 0,
        updatedAt: Date.now(),
        deviceId: getDeviceId(),
      }),
    );
  const markUnread = (v: Volume) => run(() => store.resetProgress(v.id, v.pageCount));
  const delVolume = (v: Volume) =>
    confirm(`¿Borrar ${series.name} ${v.label}? No se puede deshacer.`) && run(() => deleteVolume(v.id, session));

  return (
    <main class="home">
      <a href="#/">← Biblioteca</a>
      <h1>{series.name}</h1>
      {(error || msg) && <p role="alert">{error || msg}</p>}
      <div class="actions">
        <button type="button" onClick={rename}>Renombrar</button>
        <label>Tipo <select value={series.kind} onChange={(e) => setKind(e.currentTarget.value as Series['kind'])}>
          <option value="manga">Manga</option>
          <option value="comic">Cómic</option>
        </select></label>
        <label>Sentido <select value={series.dir} onChange={(e) => patchSeries({ dir: e.currentTarget.value as Series['dir'] })}>
          <option value="rtl">Derecha a izquierda</option>
          <option value="ltr">Izquierda a derecha</option>
        </select></label>
        <label>Modo <select value={series.mode} onChange={(e) => patchSeries({ mode: e.currentTarget.value as Series['mode'] })}>
          <option value="paged">Páginas</option>
          <option value="vertical">Vertical</option>
        </select></label>
        <button type="button" class="danger" onClick={delSeries}>Borrar serie</button>
      </div>
      <ul class="volumes">
        {volumes.map((v) => {
          const st = volumeState(prog.volumes[v.id]);
          return (
            <li key={v.id}>
              <a class="vol" href={`#/read/${v.id}`}>
                <Thumb fileId={v.thumbFileId} alt={v.label} />
                <span class="title">{v.label || 'Sin número'}</span>
                <span class="state">{STATE[st]}</span>
              </a>
              <div class="actions">
                <button type="button" onClick={() => setNumber(v)}>Cambiar número</button>
                <label>Mover a <select value={v.seriesId} onChange={(e) => move(v, e.currentTarget.value)}>
                  {lib.series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
                {st !== 'read' && <button type="button" onClick={() => markRead(v)}>Marcar como leído</button>}
                {st !== 'unread' && <button type="button" onClick={() => markUnread(v)}>Marcar como no leído</button>}
                <button type="button" class="danger" onClick={() => delVolume(v)}>Borrar</button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
