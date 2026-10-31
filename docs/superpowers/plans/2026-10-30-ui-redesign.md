# Rediseño de la interfaz — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar Biblioteca, Serie, Subir y el menú del lector al diseño aprobado, responsive celular/PC, con buscador, menús ⋮, diálogos propios, ajustes rápidos y pantalla completa.

**Architecture:** CSS plano con variables en `src/ui/styles.css`; íconos SVG inline en `src/ui/icons.tsx`; piezas reutilizables (`Dialog`/`useDialog`, `Menu`, `Shell`, `useWide`) en `src/ui/kit.tsx`; lógica pura nueva en `src/lib/library-view.ts` y `src/lib/prefs.ts`. Las vistas existentes se reescriben en su lugar. Drive, auth, store, upload y extract no se tocan.

**Tech Stack:** Preact 10 + TypeScript strict, Vite 8, Vitest 5 + jsdom + @testing-library/preact. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-30-ui-redesign-design.md` (leer entero antes de cada tarea; las medidas, colores y textos salen de ahí).

## Global Constraints

- Sin dependencias nuevas en `package.json`.
- No modificar `src/drive.ts`, `src/auth*.ts`, `src/store.ts`, `src/upload.ts`, `src/extract/**`, `src/types.ts` ni el formato de `library.json`/`progress.json`.
- Corte celular/PC: ancho `>= 900` px (`useWide`), sin importar orientación. La doble página del lector conserva su regla actual (`innerWidth > innerHeight && innerWidth >= 900`) más la preferencia `nunca`.
- Colores: fondo `#121212`, superficies `#1b1b1b`/`#1e1e1e`, bordes `#262626`–`#333`, texto `#eee`, secundario `#999`/`#aaa`, acento `#4f8cff`, peligro texto `#F09595`, peligro fondo `#b3402f`. Definirlos como variables en `:root`.
- Portadas 2:3, `object-fit: cover`, radio 6 px. Barra de progreso 3 px en acento.
- Áreas táctiles ≥ 44 px en celular; barras fijas y FAB con `env(safe-area-inset-*)`.
- Un solo botón primario (relleno acento) por pantalla.
- Textos en español rioplatense. Íconos-solo-botón con `aria-label`.
- Transiciones ≤ 200 ms y desactivadas con `prefers-reduced-motion: reduce`.
- Los 125 tests existentes siguen pasando. Se permite cambiar textos/selectores de tests de UI donde el texto cambia a propósito (lo indica cada tarea), nunca la lógica verificada.
- Comandos: `npm test` (vitest run), `npm run build` (tsc + vite build). Ambos deben quedar verdes al final de cada tarea.

## Review Focus

1. Nombres de serie largos (40+ caracteres) en portadas, filas y barras en un celular de 320 px: deben cortar con `…`, sin desbordar horizontalmente. → test en Tarea 3.
2. Buscador con acentos y mayúsculas: "pokemon" encuentra "Pokémon". → test en Tarea 1.
3. Biblioteca vacía: invita a subir (texto + acción), no muestra secciones vacías. → test en Tarea 3.
4. Cambiar Páginas↔Vertical desde el lector a mitad de tomo mantiene la página actual. → test en Tarea 6.
5. Esc con un diálogo o menú abierto cierra solo eso (no navega atrás ni cierra otra cosa). → test en Tarea 2 y Tarea 6.

---

### Task 1: Lógica pura nueva

**Files:**
- Modify: `src/lib/library-view.ts`
- Create: `src/lib/prefs.ts`
- Test: `tests/library-view.test.ts`, `tests/prefs.test.ts`

**Interfaces:**
- Produces:
  - `filterSeries(series: Series[], query: string): Series[]` — coincidencia por subcadena, sin mayúsculas ni acentos (`normalize('NFD')` + quitar `\p{Diacritic}`); query vacía o solo espacios devuelve todo.
  - `unreadCount(lib: Library, prog: ProgressFile, seriesId: string): number` — tomos de la serie con `!prog.volumes[id]?.finished`.
  - `seriesResume(lib: Library, prog: ProgressFile, seriesId: string): { volume: Volume; again: boolean } | null` — primer resultado de `continueReading` de esa serie; si no hay, primer tomo de `sortVolumes` no terminado; si todos terminados, el primero con `again: true`; `null` si la serie no tiene tomos.
  - `getDoublePref(): 'auto' | 'nunca'`, `setDoublePref(v: 'auto' | 'nunca'): void` en `src/lib/prefs.ts`, clave `cr.double`, con `try/catch` (si `localStorage` falla, `'auto'`).

- [ ] **Step 1: Tests que fallan.** En `tests/library-view.test.ts` agregar:
  - `filterSeries ignora acentos y mayúsculas`: series `Pokémon`, `Berserk`; `filterSeries(s, 'POKEMON')` → solo `Pokémon`; `filterSeries(s, '  ')` → ambas.
  - `unreadCount cuenta los no terminados`: 3 tomos, uno `finished: true`, uno en `maxPage: 2` → `2`.
  - `seriesResume`: (a) con un tomo en lectura devuelve ese con `again: false`; (b) sin lecturas devuelve el primero no terminado por número; (c) todos terminados → primero con `again: true`; (d) serie sin tomos → `null`.
  - En `tests/prefs.test.ts`: `por defecto auto`, `setDoublePref('nunca')` → `getDoublePref() === 'nunca'`.
- [ ] **Step 2:** `npx vitest run tests/library-view.test.ts tests/prefs.test.ts` → FAIL (funciones no exportadas).
- [ ] **Step 3:** Implementar las cuatro funciones con las firmas de arriba.
- [ ] **Step 4:** Mismo comando → PASS. `npm test` → todo verde.
- [ ] **Step 5:** Commit `feat: búsqueda, sin leer, tomo para seguir y preferencia de doble página`.

### Task 2: Base visual y kit

**Files:**
- Modify: `src/ui/styles.css` (reescritura completa; conservar las reglas de layout del lector `.stage`, `.spread*`, `.ppage*`, `.vstrip`, `.vpage*` tal cual, que sostienen gestos y doble página)
- Create: `src/ui/icons.tsx`, `src/ui/kit.tsx`
- Modify: `index.html` (`theme-color` → `#121212`)
- Test: `tests/kit.test.tsx`

**Interfaces:**
- Produces:
  - `icons.tsx`: componentes sin props obligatorias `({ size?: number }) => JSX` con trazo `currentColor`, 24×24, `stroke-width 2`, `aria-hidden`: `IconSearch, IconDots, IconPlus, IconBack, IconClose, IconSettings, IconPlay, IconCheck, IconHash, IconFolderMove, IconTrash, IconPencil, IconUpload, IconBooks, IconLogout, IconDirection, IconColumns, IconVertical, IconRestart, IconFullscreen, IconPrev, IconNext`.
  - `kit.tsx`:
    - `useWide(): boolean` — `innerWidth >= 900`, se actualiza en `resize`.
    - `interface DialogAction { label: string; value: string; kind?: 'primary' | 'danger' }`
    - `interface DialogOpts { title: string; message?: string; input?: { value: string; type?: 'text' | 'number'; label: string }; actions: DialogAction[] }`
    - `useDialog(): [preact.JSX.Element | null, (o: DialogOpts) => Promise<{ action: string | null; text: string }>]` — `action: null` = cancelado (Esc, tocar el fondo o botón "Cancelar", que el diálogo agrega siempre al final). Enter en el input elige la acción `primary`. Foco inicial en el input o en la primera acción. `role="dialog"`, `aria-modal`, `aria-label={title}`.
    - `interface MenuItem { label: string; icon?: preact.JSX.Element; danger?: boolean; onSelect: () => void }`
    - `Menu({ open, onClose, title?, items?, children?, anchor? }: { open: boolean; onClose: () => void; title?: string; items?: MenuItem[]; children?: preact.ComponentChildren; anchor?: HTMLElement | null })` — en celular, panel desde abajo (`.sheet`) con fondo oscurecido; en PC con `anchor`, desplegable posicionado bajo el ancla (`.dropdown`), sin `anchor`, panel centrado como diálogo. Elegir un ítem llama `onSelect` y luego `onClose`. Esc y tocar afuera llaman `onClose`. `role="menu"` / ítems `role="menuitem"`.
    - `Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string })` — grupo `role="radiogroup"`.
    - `Shell({ children, onSignOut }: { children: preact.ComponentChildren; onSignOut: () => void })` — en PC, barra lateral (Comic Reader, Biblioteca `#/`, Seguir leyendo `#/` + scroll a `#seguir`, Subir `#/upload`, Salir abajo como `<button>`); en celular, devuelve solo `children`.
  - Clases CSS que usan las tareas siguientes: `.screen` (contenido con padding y `max-width`), `.topbar`, `.icon-btn`, `.btn` / `.btn.primary` / `.btn.danger` / `.btn.ghost`, `.cover` (portada 2:3 con `.cover-title` y `.badge`), `.bar` (progreso), `.chip`, `.fab`, `.card`, `.notice` (avisos/errores), `.empty`, `.shell` / `.sidebar`, `.sheet`, `.dropdown`, `.backdrop`, `.dialog`, `.segmented`, `.ellipsis`.

- [ ] **Step 1: Tests que fallan** en `tests/kit.test.tsx` (montar un componente de prueba que llama `open` del `useDialog`):
  - `useDialog: Esc cancela` → la promesa resuelve `{ action: null }` y el diálogo desaparece.
  - `useDialog: tocar el fondo cancela`.
  - `useDialog: Enter en el input elige la acción primaria y devuelve el texto` (input `'Nuevo'`, tipear `'Otro'` → `{ action: 'ok', text: 'Otro' }`).
  - `Menu: elegir un ítem llama onSelect y onClose`.
  - `Menu: Esc llama onClose y no se propaga a window` (un listener `keydown` en `window` no recibe la Esc).
- [ ] **Step 2:** `npx vitest run tests/kit.test.tsx` → FAIL.
- [ ] **Step 3:** Escribir `icons.tsx`, `kit.tsx` y el nuevo `styles.css` (todas las clases listadas, con media query `min-width: 900px` donde haga falta y `prefers-reduced-motion`). Esc en `Dialog`/`Menu`: listener en captura que llama `stopPropagation()` para que el lector y otras vistas no la vean.
- [ ] **Step 4:** Mismo comando → PASS; `npm test` y `npm run build` → verdes.
- [ ] **Step 5:** Commit `feat: estilos nuevos, íconos y kit de diálogos y menús`.

### Task 3: Shell, biblioteca y pantallas sueltas

**Files:**
- Modify: `src/app.tsx`, `src/ui/Home.tsx`, `src/ui/shared.tsx` (Thumb sin cambios de lógica; puede tomar `class`)
- Test: `tests/app.test.tsx`, `tests/app-renew.test.tsx`, `tests/home.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `useWide`, `Shell`, `Menu`, íconos, clases de Task 2; `filterSeries`, `unreadCount` de Task 1.
- Produces: `Home({ extra?, onSignOut }: { extra?: preact.ComponentChildren; onSignOut: () => void })`. `App` envuelve Home, SeriesView y UploadView en `<Shell onSignOut>`; el lector queda fuera.

Comportamiento (spec, "Biblioteca" y "Pantallas sueltas"):
- Celular: `.topbar` con título "Biblioteca", botón lupa (`aria-label="Buscar"`) que muestra un `<input type="search" placeholder="Buscar serie">`, botón ⋮ (`aria-label="Más opciones"`) que abre `Menu` con "Salir". FAB `<a class="fab" href="#/upload" aria-label="Subir">`.
- PC: título, buscador siempre visible, `<a class="btn primary" href="#/upload">Subir</a>`.
- Sección `id="seguir"` "Seguir leyendo": celular fila desplazable de portadas; PC tarjetas en 3 columnas. Texto `Tomo N · p. X/Y` usando la etiqueta (`v04` → `Tomo 4`; `#012` → `#12`; vacía → `Sin número`). Nombres con `.ellipsis`.
- Series: grilla de `.cover` con nombre y `.badge` = `unreadCount` si > 0.
- Biblioteca vacía: `.empty` con "Subí tu primer cómic", una línea de explicación y enlace "Subir"; no se muestran las secciones.
- Login, "Cargando…", error de apertura y aviso de sesión vencida con las clases nuevas, mismos textos.

- [ ] **Step 1: Ajustar tests existentes** (cambio de texto deliberado: en PC hay "Subir" y "Biblioteca" en barra lateral y en contenido): en `tests/app.test.tsx` y `tests/app-renew.test.tsx`, `getByText('Biblioteca')` → `getByRole('heading', { name: 'Biblioteca' })`; `getByText('Subir').getAttribute('href')` → `getAllByText('Subir')` y verificar que todos los enlaces tengan `href="#/upload"`. `Salir` sigue siendo `getByText('Salir')` (jsdom tiene 1024 px de ancho: barra lateral visible).
- [ ] **Step 2: Tests nuevos** en `tests/home.test.tsx` (con `SessionContext` falso como en `tests/upload-view.test.tsx`):
  - `filtra series con el buscador`: series `Pokémon` y `Berserk`, tipear `pokemon` → `Berserk` no está.
  - `muestra los sin leer en la portada`: 3 tomos, 1 terminado → texto `2` dentro de la portada de la serie.
  - `biblioteca vacía invita a subir`: sin series → texto `Subí tu primer cómic` y no hay heading `Series`.
  - `nombres largos llevan ellipsis`: una serie de 60 caracteres → su elemento de título tiene la clase `ellipsis`.
  - `en celular Salir está en el menú ⋮`: `innerWidth = 375` + `dispatchEvent(new Event('resize'))`, `queryByText('Salir')` es null, tras clic en `Más opciones` aparece. Restaurar `innerWidth` al final.
- [ ] **Step 3:** `npx vitest run tests/home.test.tsx tests/app.test.tsx tests/app-renew.test.tsx` → FAIL en los nuevos.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Mismo comando → PASS; `npm test`, `npm run build` → verdes.
- [ ] **Step 6:** Commit `feat: biblioteca nueva con barra lateral, buscador y sin leer`.

### Task 4: Vista de serie

**Files:**
- Modify: `src/ui/SeriesView.tsx`
- Test: `tests/upload-view.test.tsx` (ajuste del test de SeriesView), `tests/series-view.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `useDialog`, `Menu`, `Segmented`, `useWide`, íconos (Task 2); `seriesResume`, `unreadCount` (Task 1). Funciones de acción existentes (`patchSeries`, `patchVolume`, `markRead`, `markUnread`, `deleteSeries`, `deleteVolume`) se mantienen; solo cambia cómo se disparan.

Comportamiento (spec, "Serie" y "Diálogos"):
- Cabecera: portada, nombre, `Manga · N tomos · M leídos` (o `Cómic`), chips sentido (`Der. a izq.` / `Izq. a der.`) y modo (`Páginas` / `Vertical`); tocar un chip abre los ajustes de serie.
- Botón primario: `seriesResume` → `Seguir: <Tomo N>, p. X` (p. = `maxPage + 1` si hay progreso, si no sin `, p.`) o `Leer de nuevo`; enlace a `#/read/<id>`. Sin tomos: no hay botón.
- Filas: miniatura, etiqueta (`Sin número` si vacía), estado `Leído` / `NN%` / `Sin leer`, barra de progreso, botón ⋮ (`aria-label="Opciones de <etiqueta>"`). Leídos con clase `.done` (atenuados). PC: tabla con cabecera Tomo / Progreso / Estado.
- ⋮ de tomo → `Menu` (con `anchor` = el botón en PC): Marcar como leído / Marcar como no leído (según estado; `reading` muestra ambas), Cambiar número, Mover a otra serie (abre un segundo `Menu` con las demás series), Borrar tomo (`danger`).
- Ajustes de serie (⚙ `aria-label="Ajustes de la serie"` en topbar celular, junto a los chips en PC) → `Menu` sin ítems con `children`: Renombrar (abre diálogo), `Segmented` Tipo, Sentido, Modo, y Borrar serie (`danger`). Cambiar Tipo conserva la regla actual (`dir` por defecto según tipo).
- `prompt`/`confirm` desaparecen: Renombrar y Cambiar número usan `useDialog` con `input`; borrar tomo y borrar serie usan `useDialog` con acción `kind: 'danger'` ("Borrar") y el texto de confirmación actual.

- [ ] **Step 1: Ajustar test existente** (texto deliberado): `SeriesView muestra "Leyendo NN%"` → espera `50%` (`findByText('50%')`); renombrar el test a `SeriesView muestra el porcentaje leído`.
- [ ] **Step 2: Tests nuevos** en `tests/series-view.test.tsx`:
  - `el botón Seguir abre el tomo en lectura`: tomos 1 y 2, progreso en el 2 (`maxPage: 4`) → enlace con texto que empieza por `Seguir` y `href="#/read/<id2>"`, contiene `p. 5`.
  - `todo leído ofrece Leer de nuevo`.
  - `borrar tomo pide confirmación`: `vi.mock('../src/upload')` con `deleteVolume` espía; abrir ⋮, elegir `Borrar tomo` → aparece `role="dialog"` y `deleteVolume` no fue llamado; clic en `Borrar` → llamado una vez.
  - `cancelar el diálogo no borra`: igual pero Esc → `deleteVolume` no llamado.
  - `cambiar número usa el diálogo`: elegir `Cambiar número`, escribir `7`, Enter → `store.updateLibrary` llamado y el tomo queda con `number: 7`.
  - `Tipo cómic pone izquierda a derecha`: en ajustes, elegir `Cómic` → la serie guardada tiene `dir: 'ltr'`.
- [ ] **Step 3:** `npx vitest run tests/series-view.test.tsx tests/upload-view.test.tsx` → FAIL en los nuevos.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Mismo comando → PASS; `npm test`, `npm run build` → verdes.
- [ ] **Step 6:** Commit `feat: vista de serie con menús, ajustes y diálogos propios`.

### Task 5: Subir

**Files:**
- Modify: `src/ui/UploadView.tsx`
- Test: `tests/upload-view.test.tsx`

**Interfaces:**
- Consumes: `useDialog`, íconos, clases (Task 2). La lógica de `subir()` (orden, `setBusy`, renovación, duplicados, `SessionExpiredError`) no cambia; solo la promesa del duplicado pasa a `useDialog` con acciones `replace` ("Reemplazar", primary), `keep` ("Subir igual"), y cancelar → `'cancel'`.

Comportamiento (spec, "Subir"):
- `.topbar` con ✕ (`<a href="#/" aria-label="Volver">`; mientras `running`, un `<button aria-label="Volver" aria-disabled>` que muestra `.notice` "Esperá a que termine la subida").
- Zona `<label class="dropzone">` con el `<input type=file>` visualmente oculto (no `display:none`, sigue en el DOM con el mismo `accept`), texto "Tocá para elegir archivos" y "o arrastralos acá · CBZ, CBR, PDF". El drop en toda la pantalla se mantiene.
- Tarjeta por archivo: serie (o "Sin serie" en rojo), chip `nueva` si no existe, `Tomo N`/etiqueta, tipo si nueva, nombre de archivo en secundario, estado a la derecha (`Listo` verde / `X/Y pág.` / error en `.notice`), barra si sube. Lápiz `aria-label="Editar <archivo>"` alterna los campos (Serie con `datalist`, Número, Tipo si nueva). Tarjetas con serie vacía arrancan abiertas.
- Botón primario fijo abajo: `Subir 1 archivo` / `Subir N archivos` (N = no listos); durante la subida `Subiendo X de N…`. Deshabilitado si alguna serie está vacía (se mantiene la regla actual).

- [ ] **Step 1: Ajustar tests existentes** (texto deliberado): en `subir()` del test, `getByText('Subir', { selector: 'button' })` → `getByRole('button', { name: /^Subir \d+ archivos?$/ })`; la espera `queryByText('Subiendo…')` → `queryByText(/^Subiendo/)`. Los tests que editan Serie/Número deben primero clic en el lápiz si la tarjeta está cerrada.
- [ ] **Step 2: Tests nuevos:**
  - `el botón dice cuántos archivos sube`: 2 archivos → `Subir 2 archivos`.
  - `duplicado usa el diálogo`: biblioteca con `Batman` #1, subir `Batman 001.cbz` → aparece `role="dialog"`; elegir `Reemplazar` → `uploadVolume` llamado con `replaceVolumeId` del existente.
  - `serie vacía abre la tarjeta y bloquea Subir`: archivo `001.cbz` (parse sin serie) → input Serie visible y botón deshabilitado.
- [ ] **Step 3:** `npx vitest run tests/upload-view.test.tsx` → FAIL en los nuevos.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Mismo comando → PASS; `npm test`, `npm run build` → verdes.
- [ ] **Step 6:** Commit `feat: pantalla de subida con zona de archivos y tarjetas`.

### Task 6: Menú del lector, ajustes rápidos y pantalla completa

**Files:**
- Modify: `src/ui/Reader.tsx`
- Test: `tests/reader.test.tsx`

**Interfaces:**
- Consumes: `useWide`, `Segmented` opcional, íconos (Task 2); `getDoublePref`/`setDoublePref` (Task 1); `store.updateLibrary(op): Promise<Library>`.
- Produces: `Reader` mantiene la firma `({ volumeId }) => JSX`. `ReaderView` recibe además `onSeries: (p: Partial<Series>) => Promise<void>` que hace `store.updateLibrary` y reemplaza `lib` en el estado de `Reader` con el resultado.

Comportamiento (spec, "Lector"):
- `useDouble` pasa a `landscape && innerWidth >= 900 && getDoublePref() === 'auto'`, recalculado al cambiar la preferencia.
- Celular (`!useWide()`): barra superior ← + título (sin ⚙); barra inferior: Tomo anterior (`IconPrev`, `aria-label="Tomo anterior"`), número actual, slider, total, Tomo siguiente; fila de ajustes: Sentido, Vertical/Páginas, Doble pág. (solo si la pantalla es apaisada y ≥ 900), Empezar de nuevo.
- PC: barra superior ← + título + chips Sentido, Páginas/Vertical, Doble, Pantalla completa (solo si `document.fullscreenEnabled`), Empezar de nuevo; barra inferior `Tomo anterior` · slider con números · `Tomo siguiente`; texto `← → páginas · F pantalla completa · Esc volver`.
- Sentido/Modo → `onSeries({ dir })` / `onSeries({ mode })`; la página actual se conserva (al pasar a vertical, `scrollIntoView` de la página actual; al pasar a páginas, se queda en `cur`).
- Tecla `f`/`F` (fuera de inputs) alterna pantalla completa con `document.documentElement.requestFullscreen()` / `document.exitFullscreen()` si `document.fullscreenEnabled`.
- Esc: si hay pantalla completa la sale el navegador; el resto igual que hoy (cierra menú o vuelve).
- "Fin del tomo / Siguiente tomo", "Progreso sin guardar" y errores se mantienen con el estilo nuevo; el texto `Siguiente tomo` del final no cambia (lo usa el test existente).

- [ ] **Step 1: Tests nuevos** en `tests/reader.test.tsx` (abrir el menú con un clic en el centro: `fireEvent.pointerDown/Up` como hace `useZoom`, o exponer el menú con la tecla `m` si no existe un camino más simple — preferir el toque; ver `src/ui/reader/useZoom.ts`):
  - `Sentido desde el menú guarda la serie`: `store.updateLibrary` espía que aplica el op sobre `lib`; clic en `Sentido` → la serie resultante tiene `dir: 'ltr'`.
  - `pasar a vertical mantiene la página`: abre en `maxPage: 2`, cambiar a Vertical → sigue visible `Página 3` y `updateLibrary` guardó `mode: 'vertical'`.
  - `F alterna pantalla completa`: `document.fullscreenEnabled = true`, `requestFullscreen` espía en `documentElement` → `keyDown f` lo llama.
  - `sin pantalla completa disponible no hay botón`: `fullscreenEnabled = false` → `queryByLabelText('Pantalla completa')` null.
  - `doble página nunca muestra una sola`: `innerWidth 1400`, `innerHeight 800`, `setDoublePref('nunca')` → solo una `img` de página visible.
  - `Esc con el menú abierto lo cierra sin salir`: menú abierto, Esc → `location.hash` sin cambio y el menú cerrado.
- [ ] **Step 2:** `npx vitest run tests/reader.test.tsx` → FAIL en los nuevos.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npm run build` → verdes.
- [ ] **Step 5:** Commit `feat: menú del lector con ajustes rápidos y pantalla completa`.

### Task 7: Verificación visual y documentación

**Files:**
- Modify: `docs/VERIFICACION.md` (agregar ítems: buscador, ⋮ de tomo, ajustes de serie, diálogos, ajustes rápidos del lector, F/pantalla completa, safe areas en iPhone)

- [ ] **Step 1:** `npm run dev` y revisar en el navegador a 375×812 y a 1400×900, con la sesión de Franco o con datos de `DevExtract` si no hay sesión: biblioteca, serie, subir, lector. Comparar con el spec. Anotar y corregir diferencias.
- [ ] **Step 2:** Revisar nombre de serie de 60 caracteres a 320 px de ancho: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 3:** `npm test` y `npm run build` → verdes.
- [ ] **Step 4:** Actualizar `docs/VERIFICACION.md`. Commit `docs: checklist de verificación de la interfaz nueva`.
