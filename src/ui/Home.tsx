import { continueReading, sortVolumes } from '../lib/library-view';
import { Thumb, useLibraryData } from './shared';

export function Home({ extra }: { extra?: preact.ComponentChildren }) {
  const { lib, prog, error } = useLibraryData();
  const cont = lib ? continueReading(lib, prog) : [];
  return (
    <main class="home">
      <h1>Biblioteca</h1>
      {error && <p role="alert">{error}</p>}
      {extra}
      <p>
        <a class="btn" href="#/upload">Subir</a>
      </p>
      {!lib && !error && <p>Cargando…</p>}
      {cont.length > 0 && (
        <section>
          <h2>Seguir leyendo</h2>
          <div class="grid">
            {cont.map(({ volume, series, pct }) => (
              <a class="card" key={volume.id} href={`#/read/${volume.id}`}>
                <Thumb fileId={volume.thumbFileId} alt={series.name} />
                <span class="title">{series.name} {volume.label}</span>
                <span class="bar"><span style={{ width: `${pct}%` }} /></span>
              </a>
            ))}
          </div>
        </section>
      )}
      {lib && (
        <section>
          <h2>Series</h2>
          {lib.series.length === 0 && <p>Todavía no subiste nada.</p>}
          <div class="grid">
            {lib.series.map((s) => {
              const first = sortVolumes(lib.volumes.filter((v) => v.seriesId === s.id))[0];
              return (
                <a class="card" key={s.id} href={`#/series/${s.id}`}>
                  {first ? <Thumb fileId={first.thumbFileId} alt={s.name} /> : <div class="thumb-ph" />}
                  <span class="title">{s.name}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
