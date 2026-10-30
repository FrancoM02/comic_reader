import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSession } from '../session';
import { nextVolume, sortVolumes } from '../lib/library-view';
import { spreadAt, step, tapZone } from '../lib/spread';
import type { Library, Series, Volume } from '../types';
import { usePages } from './reader/usePages';
import { useProgressSync } from './reader/useProgressSync';
import { useZoom } from './reader/useZoom';

const PRELOAD = 3;

function useDouble() {
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
  useEffect(() => {
    store.loadLibrary().then(setLib, (e) => setError(`No se pudo cargar la biblioteca: ${e instanceof Error ? e.message : 'error desconocido'}`));
  }, [store]);
  const volume = lib?.volumes.find((v) => v.id === volumeId);
  const series = volume && lib?.series.find((s) => s.id === volume.seriesId);
  if (!lib || !volume || !series) {
    return (
      <main class="home">
        <a href="#/">← Biblioteca</a>
        {error ? <p role="alert">{error}</p> : <p>{lib ? 'Este tomo ya no existe' : 'Cargando…'}</p>}
      </main>
    );
  }
  return <ReaderView lib={lib} volume={volume} series={series} />;
}

function ReaderView({ lib, volume, series }: { lib: Library; volume: Volume; series: Series }) {
  const { drive, store } = useSession();
  const total = volume.pageFileIds.length;
  const sync = useProgressSync(store, volume.id, total);
  const [page, setPage] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [near, setNear] = useState<number[]>([]);
  const double = useDouble() && series.mode === 'paged';
  const vertical = series.mode === 'vertical';
  const backHref = `#/series/${series.id}`;

  useEffect(() => {
    if (sync.start !== null) setPage((p) => p ?? sync.start);
  }, [sync.start]);
  const cur = page ?? 0;
  const visible = vertical ? [cur] : spreadAt(cur, total, double);
  const last = visible[visible.length - 1];
  const atEnd = page !== null && last >= total - 1;

  useEffect(() => {
    if (page !== null) sync.seen(last);
  }, [page, last, sync.seen]);

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

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') location.hash = backHref;
      else if (!vertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        go((e.key === 'ArrowLeft') === (series.dir === 'rtl') ? 1 : -1);
      }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [go, vertical, series.dir, backHref]);

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
    setPage(i);
    if (vertical) els.current[i]?.scrollIntoView();
  };
  const restart = async () => {
    setMenu(false);
    await sync.reset();
    jump(0);
  };

  const list = sortVolumes(lib.volumes.filter((v) => v.seriesId === series.id));
  const prevVol = list[list.findIndex((v) => v.id === volume.id) - 1];
  const nextVol = nextVolume(lib, volume.id);
  const title = `${series.name}${volume.label ? ` ${volume.label}` : ''}`;

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

  if (sync.error) {
    return (
      <main class="home">
        <a href={backHref}>← {series.name}</a>
        <p role="alert">{sync.error}</p>
      </main>
    );
  }

  return (
    <div class="reader">
      {!ready ? (
        <p class="reader-msg">Cargando…</p>
      ) : vertical ? (
        <div class="vstrip" ref={scroller} onClick={() => setMenu((m) => !m)}>
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
            <a class="btn" href={`#/read/${nextVol.id}`}>
              Siguiente tomo
            </a>
          )}
        </div>
      )}

      {menu && (
        <div class="reader-menu" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div class="reader-top">
            <a href={backHref}>←</a>
            <span>{title}</span>
          </div>
          <div class="reader-bottom">
            <label>
              Página {last + 1} / {total}
              <input
                type="range"
                min={1}
                max={total}
                value={cur + 1}
                dir={series.dir}
                onInput={(e) => jump(Number((e.target as HTMLInputElement).value) - 1)}
              />
            </label>
            <div class="actions">
              {prevVol && (
                <a class="btn" href={`#/read/${prevVol.id}`}>
                  Tomo anterior
                </a>
              )}
              {nextVol && (
                <a class="btn" href={`#/read/${nextVol.id}`}>
                  Tomo siguiente
                </a>
              )}
              <button type="button" onClick={restart}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
