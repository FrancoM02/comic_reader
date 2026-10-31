import { useState } from 'preact/hooks';
import { makeVolumeLabel, seriesResume, sortVolumes, unreadCount, volumeName, volumeState } from '../lib/library-view';
import { useSession } from '../session';
import { getDeviceId } from '../store';
import type { Series, Volume } from '../types';
import { deleteSeries, deleteVolume } from '../upload';
import { IconBack, IconCheck, IconDots, IconFolderMove, IconHash, IconPencil, IconPlay, IconRestart, IconSettings, IconTrash } from './icons';
import { Menu, Segmented, useDialog, useWide } from './kit';
import { StateScreen, Thumb, useLibraryData } from './shared';

const DIR = { rtl: 'Der. a izq.', ltr: 'Izq. a der.' };
const MODE = { paged: 'Páginas', vertical: 'Vertical' };

type Target = { v: Volume; el: HTMLElement };

export function SeriesView({ id }: { id: string }) {
  const session = useSession();
  const { store } = session;
  const { lib, prog, error, reload } = useLibraryData();
  const wide = useWide();
  const [dialog, ask] = useDialog();
  const [msg, setMsg] = useState('');
  const [settings, setSettings] = useState<{ el: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [move, setMove] = useState<Target | null>(null);
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

  if (!lib || !series) {
    return (
      <StateScreen href="#/" label="Biblioteca">
        {!lib ? error ? <p role="alert" class="notice">{error}</p> : <p class="muted">Cargando…</p> : <p class="empty">Esa serie no existe.</p>}
      </StateScreen>
    );
  }

  const volumes = sortVolumes(lib.volumes.filter((v) => v.seriesId === id));
  const resume = seriesResume(lib, prog, id);
  const resumeProg = resume && prog.volumes[resume.volume.id];
  const resumeText = !resume
    ? ''
    : resume.again
      ? 'Leer de nuevo'
      : `Seguir: ${volumeName(resume.volume.label)}${resumeProg && resumeProg.maxPage > 0 ? `, p. ${resumeProg.maxPage + 1}` : ''}`;
  const readCount = volumes.length - unreadCount(lib, prog, id);
  const others = lib.series.filter((s) => s.id !== id);

  const rename = async () => {
    const r = await ask({
      title: 'Renombrar serie',
      input: { value: series.name, label: 'Nombre' },
      actions: [{ label: 'Guardar', value: 'ok', kind: 'primary' }],
    });
    const n = r.text.trim();
    if (r.action && n) patchSeries({ name: n });
  };
  const setKind = (kind: Series['kind']) => patchSeries({ kind, dir: kind === 'manga' ? 'rtl' : 'ltr' });
  const delSeries = async () => {
    const r = await ask({
      title: 'Borrar serie',
      message: `¿Borrar la serie "${series.name}" y sus ${volumes.length} tomos? No se puede deshacer.`,
      actions: [{ label: 'Borrar', value: 'del', kind: 'danger' }],
    });
    if (r.action)
      run(async () => {
        await deleteSeries(id, session);
        location.hash = '#/';
      });
  };
  const setNumber = async (v: Volume) => {
    const r = await ask({
      title: 'Cambiar número',
      input: { value: v.number === null ? '' : String(v.number), type: 'number', label: 'Número del tomo (vacío = sin número)' },
      actions: [{ label: 'Guardar', value: 'ok', kind: 'primary' }],
    });
    if (!r.action) return;
    const number = r.text.trim() === '' ? null : Number(r.text);
    if (number !== null && Number.isNaN(number)) return setMsg('El número no es válido');
    patchVolume(v.id, (x) => ({ ...x, number, label: makeVolumeLabel(number, x.label, series.kind) }));
  };
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
  const delVolume = async (v: Volume) => {
    const r = await ask({
      title: 'Borrar tomo',
      message: `¿Borrar ${series.name} ${v.label}? No se puede deshacer.`,
      actions: [{ label: 'Borrar', value: 'del', kind: 'danger' }],
    });
    if (r.action) run(() => deleteVolume(v.id, session));
  };

  const openSettings = (e: MouseEvent) => setSettings({ el: e.currentTarget as HTMLElement });
  const first = volumes[0];
  const stateOf = (v: Volume) => {
    const p = prog.volumes[v.id];
    const st = volumeState(p);
    const pct = st === 'read' ? 100 : st === 'reading' && p ? Math.round(((p.maxPage + 1) / p.totalPages) * 100) : 0;
    return { st, pct, text: st === 'read' ? 'Leído' : st === 'reading' ? `${pct}%` : 'Sin leer' };
  };
  const menuV = menu?.v;
  const menuState = menuV && stateOf(menuV).st;

  return (
    <main class="screen">
      {wide ? (
        <a class="btn ghost back" href="#/">
          <IconBack size={20} />
          Biblioteca
        </a>
      ) : (
        <header class="topbar">
          <a class="icon-btn" href="#/" aria-label="Biblioteca">
            <IconBack />
          </a>
          <span class="grow" />
          <button type="button" class="icon-btn" aria-label="Ajustes de la serie" onClick={openSettings}>
            <IconSettings />
          </button>
        </header>
      )}
      {(error || msg) && (
        <p role="alert" class="notice">
          {error || msg}
        </p>
      )}
      <div class="series-layout">
        <section class="series-side">
          <div class="series-head">
            <span class="cover series-cover">{first ? <Thumb fileId={first.thumbFileId} alt="" /> : <div class="thumb-ph" />}</span>
            <div class="series-info">
              <h1>{series.name}</h1>
              <p class="series-meta">
                {series.kind === 'manga'
                  ? `Manga · ${volumes.length} ${volumes.length === 1 ? 'tomo' : 'tomos'} · ${readCount} ${readCount === 1 ? 'leído' : 'leídos'}`
                  : 'Cómic'}
              </p>
              <div class="chips">
                <button type="button" class="chip" onClick={openSettings}>
                  {DIR[series.dir]}
                </button>
                <button type="button" class="chip" onClick={openSettings}>
                  {MODE[series.mode]}
                </button>
                {wide && (
                  <button type="button" class="icon-btn" aria-label="Ajustes de la serie" onClick={openSettings}>
                    <IconSettings />
                  </button>
                )}
              </div>
            </div>
          </div>
          {resume && (
            <a class="btn primary resume-btn" href={`#/read/${resume.volume.id}`}>
              {resume.again ? <IconRestart size={20} /> : <IconPlay size={20} />}
              {resumeText}
            </a>
          )}
        </section>
        <section class="series-main">
          {wide && volumes.length > 0 && (
            <div class="vol-head" aria-hidden="true">
              <span>Tomo</span>
              <span>Progreso</span>
              <span>Estado</span>
            </div>
          )}
          <ul class="vol-list">
            {volumes.map((v) => {
              const { st, pct, text } = stateOf(v);
              const name = volumeName(v.label);
              return (
                <li key={v.id} class={st === 'read' ? 'vol-row done' : 'vol-row'}>
                  <a class="vol-link" href={`#/read/${v.id}`}>
                    <span class="vol-thumb">
                      <Thumb fileId={v.thumbFileId} alt="" />
                    </span>
                    <span class="vol-name ellipsis">{name}</span>
                    <span class="bar">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span class="vol-state">{text}</span>
                  </a>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={`Opciones de ${name}`}
                    onClick={(e) => setMenu({ v, el: e.currentTarget })}
                  >
                    <IconDots />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <Menu
        open={!!menu}
        onClose={() => setMenu(null)}
        title={menuV && volumeName(menuV.label)}
        anchor={menu?.el}
        items={
          menuV
            ? [
                ...(menuState !== 'read' ? [{ label: 'Marcar como leído', icon: <IconCheck />, onSelect: () => markRead(menuV) }] : []),
                ...(menuState !== 'unread' ? [{ label: 'Marcar como no leído', icon: <IconRestart />, onSelect: () => markUnread(menuV) }] : []),
                { label: 'Cambiar número', icon: <IconHash />, onSelect: () => setNumber(menuV) },
                ...(others.length ? [{ label: 'Mover a otra serie', icon: <IconFolderMove />, onSelect: () => setMove(menu) }] : []),
                { label: 'Borrar tomo', icon: <IconTrash />, danger: true, onSelect: () => delVolume(menuV) },
              ]
            : []
        }
      />
      <Menu
        open={!!move}
        onClose={() => setMove(null)}
        title="Mover a"
        anchor={move?.el}
        items={others.map((s) => ({ label: s.name, onSelect: () => move && patchVolume(move.v.id, (x) => ({ ...x, seriesId: s.id })) }))}
      />
      <Menu open={!!settings} onClose={() => setSettings(null)} title="Ajustes" anchor={settings?.el}>
        <button
          type="button"
          role="menuitem"
          class="menu-item"
          onClick={() => {
            setSettings(null);
            rename();
          }}
        >
          <IconPencil />
          <span class="ellipsis">Renombrar</span>
        </button>
        <div class="menu-group">
          <span>Tipo</span>
          <Segmented
            label="Tipo"
            value={series.kind}
            options={[{ value: 'manga', label: 'Manga' }, { value: 'comic', label: 'Cómic' }]}
            onChange={setKind}
          />
        </div>
        <div class="menu-group">
          <span>Sentido</span>
          <Segmented
            label="Sentido"
            value={series.dir}
            options={[{ value: 'rtl', label: DIR.rtl }, { value: 'ltr', label: DIR.ltr }]}
            onChange={(dir) => patchSeries({ dir })}
          />
        </div>
        <div class="menu-group">
          <span>Modo</span>
          <Segmented
            label="Modo"
            value={series.mode}
            options={[{ value: 'paged', label: MODE.paged }, { value: 'vertical', label: MODE.vertical }]}
            onChange={(mode) => patchSeries({ mode })}
          />
        </div>
        <button
          type="button"
          role="menuitem"
          class="menu-item danger"
          onClick={() => {
            setSettings(null);
            delSeries();
          }}
        >
          <IconTrash />
          <span class="ellipsis">Borrar serie</span>
        </button>
      </Menu>
      {dialog}
    </main>
  );
}
