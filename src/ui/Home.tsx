import { flushSync } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';
import { continueReading, filterSeries, sortVolumes, unreadCount, volumeName } from '../lib/library-view';
import { IconClose, IconDots, IconLogout, IconPlus, IconSearch } from './icons';
import { Menu, useWide } from './kit';
import { Thumb, useLibraryData } from './shared';

export function Home({ extra, onSignOut }: { extra?: preact.ComponentChildren; onSignOut: () => void }) {
  const { lib, prog, error } = useLibraryData();
  const wide = useWide();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const empty = !!lib && lib.series.length === 0;
  const cont = lib ? continueReading(lib, prog) : [];
  const shown = lib ? filterSeries(lib.series, query) : [];
  const search = (
    <input
      type="search"
      class={wide ? 'search-wide' : undefined}
      placeholder="Buscar serie"
      aria-label="Buscar serie"
      value={query}
      onInput={(e) => setQuery(e.currentTarget.value)}
      ref={searchRef}
    />
  );
  return (
    <main class="screen">
      <header class="topbar">
        {wide ? (
          <>
            <h1>Biblioteca</h1>
            {!empty && search}
            {!empty && (
              <a class="btn primary" href="#/upload">
                Subir
              </a>
            )}
          </>
        ) : (
          <>
            {searching ? search : <h1>Biblioteca</h1>}
            <button
              type="button"
              class="icon-btn"
              aria-label={searching ? 'Cerrar búsqueda' : 'Buscar'}
              onClick={() => {
                // Render síncrono y foco dentro del gesto del toque: si no, iOS no sube el teclado.
                flushSync(() => {
                  setSearching(!searching);
                  setQuery('');
                });
                searchRef.current?.focus();
              }}
            >
              {searching ? <IconClose /> : <IconSearch />}
            </button>
            <button type="button" class="icon-btn" aria-label="Más opciones" onClick={() => setMenu(true)}>
              <IconDots />
            </button>
          </>
        )}
      </header>
      {!wide && (
        <Menu open={menu} onClose={() => setMenu(false)} items={[{ label: 'Salir', icon: <IconLogout />, onSelect: onSignOut }]} />
      )}
      {error && (
        <p role="alert" class="notice">
          {error}
        </p>
      )}
      {extra}
      {!lib && !error && <p>Cargando…</p>}
      {cont.length > 0 && (
        <section id="seguir">
          <h2 class="section-title">Seguir leyendo</h2>
          <div class={wide ? 'resume-grid' : 'rail'}>
            {cont.map(({ volume, series, pct }) => {
              const p = prog.volumes[volume.id];
              const info = `${volumeName(volume.label)} · p. ${p.maxPage + 1}/${p.totalPages}`;
              const bar = (
                <span class="bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
              );
              return wide ? (
                <a class="card resume-card" key={volume.id} href={`#/read/${volume.id}`}>
                  <span class="resume-thumb">
                    <Thumb fileId={volume.thumbFileId} alt={series.name} />
                  </span>
                  <span class="resume-info">
                    <span class="ellipsis">{series.name}</span>
                    <span class="ellipsis resume-text">{info}</span>
                    {bar}
                  </span>
                </a>
              ) : (
                <a class="resume" key={volume.id} href={`#/read/${volume.id}`}>
                  <span class="cover">
                    <Thumb fileId={volume.thumbFileId} alt={series.name} />
                  </span>
                  {bar}
                  <span class="ellipsis">{series.name}</span>
                  <span class="ellipsis resume-text">{info}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}
      {lib && lib.series.length === 0 && (
        <div class="empty">
          <h2>Subí tu primer cómic</h2>
          <p>Elegí archivos CBZ, CBR o PDF y quedan guardados en tu Drive.</p>
          <a class="btn primary" href="#/upload">
            Subir
          </a>
        </div>
      )}
      {lib && lib.series.length > 0 && (
        <section>
          <h2 class="section-title">Series</h2>
          {shown.length === 0 && <p class="empty">Ninguna serie coincide.</p>}
          <div class="series-grid">
            {shown.map((s) => {
              const first = sortVolumes(lib.volumes.filter((v) => v.seriesId === s.id))[0];
              const unread = unreadCount(lib, prog, s.id);
              return (
                <a class="cover" key={s.id} href={`#/series/${s.id}`}>
                  {first ? <Thumb fileId={first.thumbFileId} alt="" /> : <div class="thumb-ph" />}
                  <span class="cover-title ellipsis">{s.name}</span>
                  {unread > 0 && (
                    <span class="badge" role="img" aria-label={`${unread} sin leer`}>
                      {unread}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </section>
      )}
      {!wide && (
        <a class="fab" href="#/upload" aria-label="Subir">
          <IconPlus />
        </a>
      )}
    </main>
  );
}
