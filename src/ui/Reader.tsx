import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSession } from '../session';
import { nextVolume, sortVolumes, volumeName } from '../lib/library-view';
import { getDoublePref, setDoublePref } from '../lib/prefs';
import { spreadAt, step, tapZone } from '../lib/spread';
import type { Library, Series, Volume } from '../types';
import { usePages } from './reader/usePages';
import { useProgressSync } from './reader/useProgressSync';
import { useZoom } from './reader/useZoom';
import { IconBack, IconColumns, IconDirection, IconFullscreen, IconNext, IconPrev, IconRestart, IconVertical } from './icons';
import { useWide } from './kit';
import { StateScreen } from './shared';

const PRELOAD = 3;

const DIR = { rtl: 'Der. a izq.', ltr: 'Izq. a der.' };

/** La pantalla admite doble página: apaisada y de 900 px o más. */
function useDoubleFits() {
  const calc = () => innerWidth > innerHeight && innerWidth >= 900;
  const [d, setD] = useState(calc);
  useEffect(() => {
    const f = () => setD(calc());
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return d;
}

export function Reader({ volumeId }: { volumeId: string }) {
  const { store } = useSession();
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const onSeries = async (p: Partial<Series>) => {
    if (!lib) return;
    const id = lib.volumes.find((v) => v.id === volumeId)?.seriesId;
    setLib(await store.updateLibrary((l) => ({ ...l, series: l.series.map((s) => (s.id === id ? { ...s, ...p } : s)) })));
  };
  useEffect(() => {
    store.loadLibrary().then(setLib, (e) => setError(`No se pudo cargar la biblioteca: ${e instanceof Error ? e.message : 'error desconocido'}`));
  }, [store]);
  const volume = lib?.volumes.find((v) => v.id === volumeId);
  const series = volume && lib?.series.find((s) => s.id === volume.seriesId);
  if (!lib || !volume || !series) {
    return (
      <StateScreen href="#/" label="Biblioteca">
        {error ? <p role="alert" class="notice">{error}</p> : lib ? <p class="empty">Este tomo ya no existe</p> : <p class="muted">Cargando…</p>}
      </StateScreen>
    );
  }
  return <ReaderView lib={lib} volume={volume} series={series} onSeries={onSeries} />;
}

function ReaderView({ lib, volume, series, onSeries }: { lib: Library; volume: Volume; series: Series; onSeries: (p: Partial<Series>) => Promise<void> }) {
  const { drive, store } = useSession();
  const total = volume.pageFileIds.length;
  const sync = useProgressSync(store, volume.id, total);
  const [page, setPage] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [near, setNear] = useState<number[]>([]);
  const wide = useWide();
  const fits = useDoubleFits();
  const [doublePref, setDouble] = useState(getDoublePref);
  const double = fits && doublePref === 'auto' && series.mode === 'paged';
  const vertical = series.mode === 'vertical';
  const backHref = `#/series/${series.id}`;

  useEffect(() => {
    if (sync.start !== null) setPage((p) => p ?? sync.start);
  }, [sync.start]);
  const cur = page ?? 0;
  const visible = vertical ? [cur] : spreadAt(cur, total, double);
  const last = visible[visible.length - 1];
  const atEnd = page !== null && last >= total - 1;

  // Cambios de página justo después de un salto con el slider (incluido el scroll que provoca)
  // no cuentan como leídos hasta quedarse 2 s (sync.jumped).
  const jumpAt = useRef(0);
  useEffect(() => {
    if (page === null) return;
    if (Date.now() - jumpAt.current < 500) sync.jumped(last);
    else sync.seen(last);
  }, [page, last, sync.seen, sync.jumped]);

  const want = useMemo(() => {
    const w = [...visible, cur - 1, ...near];
    for (let i = 1; i <= PRELOAD; i++) w.push(last + i);
    return [...new Set(w)].sort((a, b) => a - b);
  }, [visible.join(','), cur, near.join(',')]);
  const pages = usePages(drive, volume.pageFileIds, page === null ? [] : want, cur);

  const go = useCallback((d: 1 | -1) => setPage((p) => (p === null ? p : step(p, total, double, d))), [total, double]);

  const zoom = useZoom({
    resetKey: cur,
    onSwipe: (dx) => go((dx < 0) === (series.dir === 'ltr') ? 1 : -1),
    onTap: (x, w) => {
      const z = tapZone(x, w, series.dir);
      if (z === 'menu') setMenu((m) => !m);
      else go(z === 'next' ? 1 : -1);
    },
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) return;
    // Si el navegador la niega no hay nada que hacer: se sigue leyendo igual.
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return; // esa Esc la usa el navegador para salir de pantalla completa
        if (menu) setMenu(false);
        else location.hash = backHref;
      } else if (e.target instanceof HTMLInputElement) return;
      else if (!vertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        go((e.key === 'ArrowLeft') === (series.dir === 'rtl') ? 1 : -1);
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen();
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [go, vertical, series.dir, backHref, menu]);

  // Vertical: la página actual es la que cruza el centro; se cargan las que se acercan.
  const scroller = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLElement | null)[]>([]);
  const ready = page !== null;
  useEffect(() => {
    if (!vertical || !ready || typeof IntersectionObserver === 'undefined') return;
    els.current[cur]?.scrollIntoView();
    const root = scroller.current;
    const idx = (el: Element) => Number((el as HTMLElement).dataset.i);
    const center = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setPage(idx(e.target))),
      { root, rootMargin: '-50% 0px -50% 0px' },
    );
    const inView = new Set<number>();
    const approach = new IntersectionObserver(
      (es) => {
        es.forEach((e) => (e.isIntersecting ? inView.add(idx(e.target)) : inView.delete(idx(e.target))));
        setNear([...inView]);
      },
      { root, rootMargin: '150% 0px' },
    );
    els.current.forEach((el) => el && (center.observe(el), approach.observe(el)));
    return () => {
      center.disconnect();
      approach.disconnect();
    };
    // Solo al quedar listo: después la página la mueve el scroll.
  }, [vertical, ready]);

  const jump = (i: number) => {
    jumpAt.current = Date.now();
    setPage(i);
    if (vertical) els.current[i]?.scrollIntoView();
  };
  const [menuError, setMenuError] = useState('');
  const restart = async () => {
    setMenuError('');
    try {
      await sync.reset();
    } catch (e) {
      setMenuError(`No se pudo empezar de nuevo: ${e instanceof Error ? e.message : 'error desconocido'}`);
      return;
    }
    setMenu(false);
    jump(0);
  };
  // Al pasar a vertical, el efecto de arriba lleva el scroll a `cur`; al volver a páginas se queda en `cur`.
  const patch = async (p: Partial<Series>) => {
    setMenuError('');
    try {
      await onSeries(p);
    } catch (e) {
      setMenuError(`No se pudo guardar: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  };
  const toggleDouble = () => {
    const v = doublePref === 'auto' ? 'nunca' : 'auto';
    setDoublePref(v);
    setDouble(v);
  };
  const [scrub, setScrub] = useState<number | null>(null);
  // En vertical la última página puede no llegar nunca al centro: el fondo del scroll la cuenta.
  const onVScroll = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setPage(total - 1);
  };

  const list = sortVolumes(lib.volumes.filter((v) => v.seriesId === series.id));
  const prevVol = list[list.findIndex((v) => v.id === volume.id) - 1];
  const nextVol = nextVolume(lib, volume.id);
  const rtl = series.dir === 'rtl';
  // El slider rtl arranca a la derecha: ahí va la página actual y a la izquierda el total.
  const curNum = <span class="reader-num">{scrub ?? last + 1}</span>;
  const totalNum = <span class="reader-num">{total}</span>;
  const title = `${series.name} · ${volumeName(volume.label)}`;
  const volLink = (v: Volume | undefined, label: string, icon: preact.JSX.Element) => {
    const body = wide ? <>{icon}{label}</> : icon;
    const cls = wide ? 'btn ghost' : 'icon-btn';
    const aria = wide ? undefined : label;
    return v ? (
      <a class={cls} href={`#/read/${v.id}`} aria-label={aria}>
        {body}
      </a>
    ) : (
      <button type="button" class={cls} aria-label={aria} disabled>
        {body}
      </button>
    );
  };

  const img = (i: number) => {
    const u = pages.url(i);
    if (u) return <img src={u} alt={`Página ${i + 1}`} draggable={false} />;
    if (pages.failed(i))
      return (
        <div class="pg-ph">
          <p>No se pudo cargar la página {i + 1}</p>
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
              e.stopPropagation();
              pages.retry(i);
            }}>
            Reintentar
          </button>
        </div>
      );
    return <div class="pg-ph">Cargando…</div>;
  };

  // Ajustes rápidos: chips en la barra de arriba (PC) o fila abajo (celular).
  const quick = (
    <div class="chips">
      <button type="button" class="chip" onClick={() => patch({ dir: series.dir === 'rtl' ? 'ltr' : 'rtl' })}>
        <IconDirection size={16} />
        Sentido: {DIR[series.dir].toLowerCase()}
      </button>
      <button type="button" class="chip" onClick={() => patch({ mode: vertical ? 'paged' : 'vertical' })}>
        {vertical ? <IconVertical size={16} /> : <IconColumns size={16} />}
        {vertical ? 'Vertical' : 'Páginas'}
      </button>
      {/* En celular (< 900 px) nunca entra la doble página, así que el chip es solo de PC. */}
      {wide && (
        <button type="button" class="chip" aria-pressed={doublePref === 'auto'} disabled={!fits || vertical} onClick={toggleDouble}>
          Doble pág.
        </button>
      )}
      {wide && document.fullscreenEnabled && (
        <button type="button" class="chip" aria-label="Pantalla completa" onClick={toggleFullscreen}>
          <IconFullscreen size={16} />
          Pantalla completa
        </button>
      )}
      <button type="button" class="chip" onClick={restart}>
        <IconRestart size={16} />
        Empezar de nuevo
      </button>
    </div>
  );

  if (sync.error) {
    return (
      <StateScreen href={backHref} label={series.name}>
        <p role="alert" class="notice">{sync.error}</p>
      </StateScreen>
    );
  }

  return (
    <div class="reader">
      {!ready ? (
        <p class="reader-msg">Cargando…</p>
      ) : vertical ? (
        <div class="vstrip" ref={scroller} onScroll={onVScroll} onClick={() => setMenu((m) => !m)}>
          {volume.pageFileIds.map((_, i) => (
            <div class="vpage" key={i} data-i={i} ref={(el) => { els.current[i] = el; }}>
              {Math.abs(i - cur) <= 5 ? img(i) : <div class="pg-ph" />}
            </div>
          ))}
        </div>
      ) : (
        <div class="stage" {...zoom.handlers}>
          <div
            class={`spread${series.dir === 'rtl' ? ' rtl' : ''}${visible.length > 1 ? ' two' : ''}`}
            style={{ transform: `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.s})` }}
          >
            {visible.map((i) => (
              <div class="ppage" key={i}>
                {img(i)}
              </div>
            ))}
          </div>
        </div>
      )}

      {atEnd && !menu && (
        <div class="reader-end">
          <span>Fin del tomo</span>
          {nextVol && (
            <a class="btn primary" href={`#/read/${nextVol.id}`}>
              Siguiente tomo
            </a>
          )}
        </div>
      )}

      {menu && (
        <div class="reader-menu" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div class="reader-top">
            <a class="icon-btn" href={backHref} aria-label="Volver">
              <IconBack />
            </a>
            <span class="reader-title ellipsis">{title}</span>
            {wide && quick}
          </div>
          <div class="reader-bottom">
            <div class="reader-pages">
              {volLink(prevVol, 'Tomo anterior', <IconPrev size={20} />)}
              {rtl ? totalNum : curNum}
              <input
                type="range"
                aria-label="Página"
                min={1}
                max={total}
                value={scrub ?? cur + 1}
                dir={series.dir}
                onInput={(e) => setScrub(Number((e.target as HTMLInputElement).value))}
                onChange={(e) => {
                  setScrub(null);
                  jump(Number((e.target as HTMLInputElement).value) - 1);
                }}
              />
              {rtl ? curNum : totalNum}
              {volLink(nextVol, 'Tomo siguiente', <IconNext size={20} />)}
            </div>
            {wide ? <p class="reader-hint">← → páginas · F pantalla completa · Esc volver</p> : quick}
            {sync.unsaved && <p role="status" class="notice">Progreso sin guardar</p>}
            {menuError && <p role="alert" class="notice">{menuError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
