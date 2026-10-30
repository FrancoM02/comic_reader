# Comic Reader — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una PWA estática para leer CBZ/CBR/PDF subidos al Google Drive del usuario, con biblioteca por series y progreso sincronizado entre dispositivos.

**Architecture:** SPA en Preact + TypeScript, compilada con Vite y publicada en GitHub Pages. No hay backend. El navegador habla directo con la API REST de Drive v3 usando un token OAuth con scope `drive.file`. Cada archivo se "explota" en páginas al subirlo. `library.json` y `progress.json` en Drive son la única fuente de verdad, y siempre se guardan con el ciclo leer → combinar → escribir.

**Tech Stack:** Vite 5, TypeScript 5 (strict), Preact 10, Vitest 2 (+ jsdom), fflate (ZIP), libarchive.js (RAR por WASM), pdfjs-dist (PDF), vite-plugin-pwa, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-29-comic-reader-design.md`

## Global Constraints

- Costo $0 y sin tarjeta. No se agrega ningún servicio pago ni backend.
- Scope OAuth: solo `https://www.googleapis.com/auth/drive.file`.
- Carpeta raíz en Drive: `ComicReader/`, con `library.json`, `progress.json` y `volumes/<volumeId>/`.
- Páginas: las que ya son JPEG/PNG/WebP se suben sin recomprimir. Las que salen de un PDF se renderizan a **JPEG calidad 0.9 con 1800 px de ancho**. Se usa JPEG porque Safari en iOS no puede generar WebP con canvas, y eso cambia el `thumb.webp` del spec por `thumb.jpg`.
- Miniatura: `thumb.jpg`, JPEG de 400 px de ancho, hecha con la primera página.
- Páginas: orden natural, y se ignora todo lo que no sea imagen (`ComicInfo.xml`, `Thumbs.db`, `__MACOSX/`, archivos ocultos).
- Progreso: **nunca retrocede**. Gana el `resetGen` más alto. Si empatan, gana el `maxPage` más alto, y `finished` queda en true si alguna de las dos entradas lo tiene. `updatedAt` se usa solo para ordenar.
- Subida interrumpida: se borra lo que quedó y se pide el archivo de nuevo. Nunca se retoma.
- Tema oscuro por defecto. Sin modo offline: el Service Worker solo cachea el shell de la app.
- Los textos de la interfaz van en español rioplatense ("Seguir leyendo", "Empezar de nuevo", "Marcar como no leído", "La subida de X se cortó, elegí el archivo de nuevo").

## Review Focus

1. **Subir dos veces el mismo tomo** (misma serie y mismo número): no tiene que aparecer duplicado en silencio. Hay que preguntar "Reemplazar / Subir igual / Cancelar". → test en Task 7.
2. **CBZ con las páginas dentro de una subcarpeta**, o con varias subcarpetas (`Vol 1/001.jpg`): se ordenan por ruta completa con orden natural. → test en Task 5.
3. **Nombre de archivo sin número** (un one-shot, `Akira.cbz`): se toma como serie "Akira" con `number: null` y etiqueta vacía, y se ordena al final de su serie. → test en Task 3.
4. **Escrituras simultáneas de `library.json`** (subís desde la PC mientras borrás algo desde el celular): cada operación vuelve a leer el archivo remoto y aplica solo su cambio, así no se pierden tomos. → test en Task 6.
5. **El token vence en mitad de una subida larga**: la petición que recibe 401 renueva el token una vez y se reintenta, y la subida sigue sin cortarse. → test en Task 4.

---

## Estructura de archivos

```
comic_reader/
├── index.html
├── package.json · tsconfig.json · vite.config.ts
├── .github/workflows/deploy.yml
├── README.md                      ← incluye guía de Google Cloud Console
├── public/icons/…                 ← íconos PWA
├── src/
│   ├── main.tsx                   ← arranque, router por hash
│   ├── config.ts                  ← GOOGLE_CLIENT_ID (de import.meta.env)
│   ├── types.ts                   ← Series, Volume, Library, VolumeProgress, ProgressFile
│   ├── auth.ts                    ← login y tokens
│   ├── drive.ts                   ← cliente REST de Drive con reintentos
│   ├── store.ts                   ← library.json / progress.json (leer-combinar-escribir)
│   ├── lib/filename.ts            ← parseFilename
│   ├── lib/progress.ts            ← mergeProgress, mergeProgressFiles
│   ├── lib/sort.ts                ← naturalCompare, isImageEntry
│   ├── lib/spread.ts              ← lógica de páginas del lector (pura)
│   ├── extract/index.ts           ← extractPages(file) despacha según extensión
│   ├── extract/zip.ts · rar.ts · pdf.ts
│   ├── upload.ts                  ← pipeline de subida + limpieza de huérfanos
│   └── ui/
│       ├── Home.tsx               ← Seguir leyendo + grilla de series
│       ├── SeriesView.tsx         ← tomos de una serie, edición, borrar
│       ├── UploadView.tsx         ← elegir archivos, confirmar, progreso
│       ├── Reader.tsx             ← lector
│       └── styles.css
└── tests/                         ← *.test.ts, fixtures/
```

Rutas por hash: `#/`, `#/series/:id`, `#/upload`, `#/read/:volumeId`, `#/dev/extract` (solo en desarrollo).

---

### Task 1: Proyecto base, PWA y deploy

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/config.ts`, `src/ui/styles.css`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `.github/workflows/deploy.yml`, `.gitignore`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `GOOGLE_CLIENT_ID: string` (de `import.meta.env.VITE_GOOGLE_CLIENT_ID`) en `src/config.ts`; `npm test` (vitest run), `npm run build`, `npm run dev`.

- [ ] **Step 1: Requisito previo.** Node no está instalado en la máquina de Franco. Pedile que corra `sudo pacman -S nodejs npm` y confirmá que `node --version` muestre ≥ 20.
- [ ] **Step 2: Crear el proyecto Vite** con preact-ts y agregar `vitest`, `jsdom`, `vite-plugin-pwa`. Configurar `base: './'` en Vite, porque GitHub Pages sirve el sitio desde `/<repo>/`. Manifest PWA: `name: "Comic Reader"`, `display: "standalone"`, `background_color` y `theme_color` `#111111`. Workbox cachea solo los assets del build.
- [ ] **Step 3: Test de humo** `tests/smoke.test.ts`: `expect(1+1).toBe(2)`. Correr `npm test`; tiene que dar PASS.
- [ ] **Step 4: Workflow `deploy.yml`.** Se dispara con push a `main`: `npm ci && npm test && npm run build` y después `actions/deploy-pages`. Toma `VITE_GOOGLE_CLIENT_ID` de un secret o variable del repo.
- [ ] **Step 5: Commit** `chore: proyecto base Vite + Preact + PWA + deploy`.

### Task 2: Login de Google (spike de riesgo, con validación en iPhone)

**Files:**
- Create: `src/auth.ts`, `tests/auth.test.ts`
- Modify: `src/main.tsx` (pantalla "Entrar con Google" si no hay sesión), `README.md` (guía de Google Cloud)

**Interfaces:**
- Produces:
  - `initAuth(clientId: string): Promise<void>`
  - `isSignedIn(): boolean`
  - `signIn(): Promise<void>`
  - `getToken(opts?: { forceRefresh?: boolean }): Promise<string>`. Devuelve un token vigente y lo renueva si le quedan menos de 5 min o si `forceRefresh`.
  - `signOut(): void`

- [ ] **Step 1: Tests** en `tests/auth.test.ts`, mockeando la capa de transporte del token:
  - `getToken devuelve el token cacheado si vence en más de 5 min`
  - `getToken renueva si vence en menos de 5 min`
  - `getToken({forceRefresh:true}) siempre renueva`
  - `dos llamadas concurrentes a getToken disparan una sola renovación`
- [ ] **Step 2:** Correr `npx vitest run tests/auth.test.ts` → FAIL.
- [ ] **Step 3: Implementar `auth.ts`** con el *token client* de Google Identity Services (`google.accounts.oauth2.initTokenClient`). La renovación silenciosa usa `requestAccessToken({prompt: ''})`. El token y su vencimiento se guardan en `localStorage` (`cr.token`). La implementación tiene que quedar detrás de una interfaz de transporte, para poder cambiarla en el Step 6.
- [ ] **Step 4:** Correr los tests → PASS.
- [ ] **Step 5: README.** Guía paso a paso para Franco: crear el proyecto en Google Cloud Console, habilitar la Drive API, configurar la pantalla de consentimiento (External, publicada "In production", scope `drive.file`), crear el client ID web con el origen autorizado `https://<usuario>.github.io`, y guardarlo como variable del repo `VITE_GOOGLE_CLIENT_ID`. Agregar también cómo crear el repo público y activar Pages, porque Pages gratis requiere repo público. El client ID no es un secreto.
- [ ] **Step 6: Validación en iPhone (bloqueante).** Hacer deploy y pedirle a Franco que, en el iPhone, (a) abra el sitio en Safari y entre, y (b) lo agregue a la pantalla de inicio, lo abra desde ahí y entre. Criterio: en ambos casos vuelve a la app con sesión iniciada. **Si (b) falla:** agregar un transporte alternativo por redirección (`https://accounts.google.com/o/oauth2/v2/auth?response_type=token&prompt=none…`, leyendo el `#access_token` al volver), que se use solo en modo standalone en iOS (`navigator.standalone === true`). Volver a probar. Si sigue fallando, documentar en el README que en iPhone se usa desde Safari y seguir adelante.
- [ ] **Step 7: Commit** `feat: login con Google (drive.file)`.

### Task 3: Parser de nombres de archivo

**Files:**
- Create: `src/lib/filename.ts`, `tests/filename.test.ts`

**Interfaces:**
- Produces: `parseFilename(name: string): { series: string; number: number | null; label: string; kind: 'volume' | 'issue' | null }`

- [ ] **Step 1: Tests** (tabla de casos, `it.each`). Formato: entrada → `{series, number, label, kind}`:
  - `Chainsaw Man v03.cbz` → `Chainsaw Man`, 3, `v03`, volume
  - `Batman (2016) #045.cbr` → `Batman (2016)`, 45, `#045`, issue
  - `One Piece Vol. 12.pdf` → `One Piece`, 12, `v12`, volume
  - `Berserk Tomo 7.cbz` → `Berserk`, 7, `v07`, volume
  - `Dandadan T03.cbz` → `Dandadan`, 3, `v03`, volume
  - `[GrupoX] Frieren v01.cbz` → `Frieren`, 1, `v01`, volume
  - `Saga_054.cbr` → `Saga`, 54, `#054`, issue
  - `Kaiju.No.8.c045.cbz` → `Kaiju No 8`, 45, `#045`, issue
  - `Akira.cbz` → `Akira`, null, `''`, null
  - `Blame! v02.5.cbz` → `Blame!`, 2.5, `v02.5`, volume
- [ ] **Step 2:** Correr `npx vitest run tests/filename.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Sacar la extensión y las etiquetas entre `[]`. Reemplazar `_` y `.` (salvo el punto decimal dentro del número) por espacio. Buscar desde el final un marcador de tomo (`v`, `vol`, `vol.`, `tomo`, `t`) o de issue (`#`, `c`, o un número suelto al final). La etiqueta se normaliza a `vNN` (2 dígitos) o `#NNN` (3 dígitos).
- [ ] **Step 4:** Correr los tests → PASS.
- [ ] **Step 5: Commit** `feat: parser de nombres de archivo`.

### Task 4: Cliente de Drive

**Files:**
- Create: `src/drive.ts`, `tests/drive.test.ts`

**Interfaces:**
- Consumes: `getToken` (Task 2)
- Produces: `createDrive(getToken: (o?: {forceRefresh?: boolean}) => Promise<string>, fetchFn = fetch): Drive`, con:
  - `findOrCreateFolder(name: string, parentId?: string): Promise<string>`
  - `findFile(name: string, parentId: string): Promise<string | null>`
  - `readJson<T>(fileId: string): Promise<T>`
  - `writeJson(name: string, parentId: string, data: unknown, fileId?: string): Promise<string>`. Si recibe `fileId`, actualiza el contenido de ese archivo; si no, lo crea.
  - `uploadBlob(name: string, parentId: string, blob: Blob): Promise<string>` (multipart upload)
  - `downloadBlob(fileId: string, signal?: AbortSignal): Promise<Blob>` (`alt=media`)
  - `listChildren(folderId: string): Promise<{ id: string; name: string; mimeType: string }[]>` (pagina hasta terminar)
  - `deleteFile(fileId: string): Promise<void>`

- [ ] **Step 1: Tests** con un `fetchFn` falso:
  - `reintenta 429 con backoff y tiene éxito al 3er intento`
  - `reintenta 403 con reason rateLimitExceeded/userRateLimitExceeded, pero no otros 403`
  - `reintenta 5xx hasta 5 veces y luego lanza error`
  - `ante 401 llama getToken({forceRefresh:true}) una vez y reintenta con el token nuevo` (Review Focus 5)
  - `listChildren sigue nextPageToken hasta agotar`
  - `findOrCreateFolder no crea si ya existe una carpeta con ese nombre y parent`
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar.** Backoff exponencial con jitter: base 500 ms, factor 2, tope 16 s. La espera se inyecta para que los tests corran con timers falsos.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5: Commit** `feat: cliente REST de Drive con reintentos`.

### Task 5: Extractores de páginas

**Files:**
- Create: `src/lib/sort.ts`, `src/extract/index.ts`, `src/extract/zip.ts`, `src/extract/rar.ts`, `src/extract/pdf.ts`, `tests/sort.test.ts`, `tests/extract-zip.test.ts`
- Modify: `src/main.tsx` (ruta `#/dev/extract` solo con `import.meta.env.DEV`)

**Interfaces:**
- Produces:
  - `naturalCompare(a: string, b: string): number`
  - `isImageEntry(path: string): boolean`
  - `type Page = { index: number; blob: Blob }`
  - `extractPages(file: File): Promise<{ total: number; pages: AsyncGenerator<Page> }>`. Devuelve las páginas **de a una**, sin tener todas en memoria.
  - `makeThumb(page: Blob): Promise<Blob>` (JPEG de 400 px de ancho)

- [ ] **Step 1: Tests de orden y filtro** en `sort.test.ts`:
  - `['10.jpg','2.jpg','1.jpg']` ordenado → `['1.jpg','2.jpg','10.jpg']`
  - `['Vol 1/010.jpg','Vol 1/002.jpg','Vol 2/001.jpg']` → orden por ruta completa (Review Focus 2)
  - `isImageEntry` acepta `.jpg .jpeg .png .webp .gif .avif` (sin distinguir mayúsculas) y rechaza `ComicInfo.xml`, `Thumbs.db`, `__MACOSX/._001.jpg` y `.hidden.jpg`
- [ ] **Step 2: Test de ZIP** en `extract-zip.test.ts`. Arma con fflate, en memoria, un CBZ con `ComicInfo.xml`, `sub/2.png`, `sub/10.png` y `sub/1.png`, y verifica que `total === 3` y que el orden de los blobs es 1, 2, 10.
- [ ] **Step 3:** Correr → FAIL.
- [ ] **Step 4: Implementar.**
  - `zip.ts`: fflate `unzip` filtrando con `isImageEntry`. Para no cargar todo de una vez, leer primero el directorio central y descomprimir cada entrada a medida que se pide.
  - `rar.ts`: libarchive.js (worker + wasm) con `getFilesArray()` y `extract()` por archivo.
  - `pdf.ts`: pdfjs-dist renderiza cada página a un canvas de 1800 px de ancho y la pasa a JPEG 0.9. Liberar el canvas (`width = 0`) después de cada página.
  - `index.ts` despacha según la extensión (`.cbz/.zip`, `.cbr/.rar`, `.pdf`). Para cualquier otra extensión lanza `Error('Formato no soportado')`.
- [ ] **Step 5:** Correr → PASS.
- [ ] **Step 6: Página `#/dev/extract`.** Elegís un archivo, la página lo extrae y muestra la cantidad de páginas y las miniaturas. Verificación manual con un CBR (incluido uno RAR5) y un PDF reales de Franco. Criterio: el orden y la cantidad son correctos.
- [ ] **Step 7: Commit** `feat: extracción de páginas CBZ/CBR/PDF`.

### Task 6: Store de biblioteca y progreso

**Files:**
- Create: `src/types.ts`, `src/lib/progress.ts`, `src/store.ts`, `tests/progress.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Consumes: `Drive` (Task 4)
- Produces:
  ```ts
  type SeriesKind = 'manga' | 'comic'
  interface Series { id: string; name: string; kind: SeriesKind; dir: 'rtl' | 'ltr'; mode: 'paged' | 'vertical'; createdAt: number }
  interface Volume { id: string; seriesId: string; number: number | null; label: string; pageCount: number;
                     folderId: string; pageFileIds: string[]; thumbFileId: string; uploadedAt: number }
  interface Library { version: 1; series: Series[]; volumes: Volume[] }
  interface VolumeProgress { maxPage: number; totalPages: number; finished: boolean; resetGen: number; updatedAt: number; deviceId: string }
  interface ProgressFile { version: 1; volumes: Record<string, VolumeProgress> }
  ```
  - `mergeProgress(a: VolumeProgress, b: VolumeProgress): VolumeProgress`
  - `mergeProgressFiles(a: ProgressFile, b: ProgressFile): ProgressFile`
  - `createStore(drive: Drive): Store`, con:
    - `init(): Promise<{ rootId: string; volumesId: string }>`. Crea `ComicReader/`, `volumes/` y los JSON vacíos si no existen.
    - `loadLibrary(): Promise<Library>`
    - `updateLibrary(op: (lib: Library) => Library): Promise<Library>`. Lee el remoto, aplica `op` y escribe.
    - `loadProgress(): Promise<ProgressFile>`. Siempre lee de Drive, nunca de caché.
    - `saveProgress(volumeId: string, p: VolumeProgress): Promise<void>`. Lee el remoto, combina con `mergeProgress` y escribe.
    - `resetProgress(volumeId: string, totalPages: number): Promise<void>`. Pone `resetGen = remoto + 1`, `maxPage = 0` y `finished = false`.
  - `getDeviceId(): string` (un UUID guardado en `localStorage` con la clave `cr.deviceId`)

- [ ] **Step 1: Tests de `mergeProgress`:**
  - `misma resetGen: gana maxPage mayor aunque su updatedAt sea más viejo` (el caso de la tablet con la página 10 frente al celular con la 50)
  - `finished true en cualquiera de los dos → true`
  - `resetGen mayor gana aunque su maxPage sea menor`
  - `updatedAt del resultado = max de ambos`
  - `mergeProgressFiles une claves presentes en uno solo`
- [ ] **Step 2: Tests de store** con un `Drive` falso en memoria:
  - `init en Drive vacío crea carpetas y JSON; segunda llamada no duplica`
  - `updateLibrary relee el remoto: dos ops intercaladas (agregar tomo A en "PC", borrar tomo B en "celular") conservan ambas` (Review Focus 4)
  - `saveProgress no baja maxPage si el remoto ya tiene uno mayor`
  - `resetProgress luego de saveProgress con página vieja de otro device → queda en 0`
- [ ] **Step 3:** Correr → FAIL.
- [ ] **Step 4: Implementar.** Los ids de archivo de `library.json` y `progress.json` se guardan en memoria después de `init`.
- [ ] **Step 5:** Correr → PASS.
- [ ] **Step 6: Commit** `feat: store de biblioteca y progreso con merge`.

### Task 7: Pipeline de subida y limpieza

**Files:**
- Create: `src/upload.ts`, `src/ui/UploadView.tsx`, `tests/upload.test.ts`
- Modify: `src/main.tsx` (ruta `#/upload` y llamada a `cleanupOrphans` al arrancar)

**Interfaces:**
- Consumes: `extractPages`, `makeThumb` (Task 5); `Store`, `Library`, `Volume` (Task 6); `Drive` (Task 4); `parseFilename` (Task 3)
- Produces:
  - `findDuplicate(lib: Library, seriesId: string, number: number | null): Volume | undefined`
  - `uploadVolume(args: { file: File; seriesId: string; number: number | null; label: string; replaceVolumeId?: string },
      deps: { drive: Drive; store: Store; volumesId: string },
      onProgress: (done: number, total: number) => void): Promise<Volume>`
  - `cleanupOrphans(deps: { drive: Drive; store: Store; volumesId: string }): Promise<string[]>`. Devuelve los nombres de los archivos cuya subida se cortó, para mostrar el aviso.
  - `deleteVolume(volumeId: string, deps): Promise<void>`
  - `deleteSeries(seriesId: string, deps): Promise<void>`

- [ ] **Step 1: Tests** con Drive y Store falsos y un `extractPages` falso:
  - `sube páginas con concurrencia máxima 3 y escribe library.json sólo al final`
  - `durante la subida existe localStorage 'cr.pendingUpload' = {folderId, fileName}; al terminar se borra`
  - `cleanupOrphans borra la carpeta de pendingUpload y las carpetas de volumes/ que no están en library.json, y devuelve el fileName`
  - `findDuplicate encuentra mismo seriesId+number; number null nunca es duplicado` (Review Focus 1)
  - `con replaceVolumeId, al terminar se elimina el tomo viejo y su carpeta, y se borra su progreso`
  - `deleteSeries borra todas las carpetas de sus tomos y la serie`
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar `upload.ts`.** Los nombres de las páginas son `0001.jpg`, `0002.png`, etc., con la extensión que corresponda a cada imagen.
- [ ] **Step 4: Implementar `UploadView`.**
  - Selector múltiple, con arrastrar y soltar en la PC.
  - Por cada archivo, una fila de confirmación: serie (campo de texto con autocompletado de las series existentes) y número, ya rellenados con `parseFilename`.
  - Si la serie es nueva, se elige manga o cómic. Manga queda con `dir: 'rtl'` y cómic con `'ltr'`; `mode: 'paged'` en los dos casos.
  - Si hay un duplicado, aparece el diálogo "Reemplazar / Subir igual / Cancelar".
  - Barra de progreso por archivo. Los archivos se suben de a uno.
  - Al arrancar, si `cleanupOrphans` devuelve nombres, se muestra el aviso "La subida de X se cortó, elegí el archivo de nuevo".
- [ ] **Step 5:** Correr → PASS.
- [ ] **Step 6: Verificación manual.** Subir un CBZ desde la PC y comprobar en Drive la estructura `ComicReader/volumes/<id>/0001.jpg…`. Repetir pero cerrando la pestaña a mitad de la subida: al reabrir tiene que aparecer el aviso y la carpeta tiene que desaparecer de Drive.
- [ ] **Step 7: Commit** `feat: subida de tomos con confirmación y limpieza de cortes`.

### Task 8: Biblioteca (Home y Serie)

**Files:**
- Create: `src/ui/Home.tsx`, `src/ui/SeriesView.tsx`, `src/lib/library-view.ts`, `tests/library-view.test.ts`

**Interfaces:**
- Consumes: `Library`, `ProgressFile`, `Store`, `deleteVolume`, `deleteSeries`
- Produces:
  - `continueReading(lib: Library, prog: ProgressFile): { volume: Volume; series: Series; pct: number }[]`. Incluye los tomos con `0 < maxPage` y `!finished`, ordenados por `updatedAt` descendente.
  - `volumeState(p?: VolumeProgress): 'unread' | 'reading' | 'read'`
  - `sortVolumes(vs: Volume[]): Volume[]`. Ordena por número ascendente; los `null` van al final, ordenados por `uploadedAt`.
  - `nextVolume(lib: Library, volumeId: string): Volume | undefined`

- [ ] **Step 1: Tests** de las cuatro funciones, incluido `sortVolumes([#3, null, #1, #2.5]) → [#1, #2.5, #3, null]`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar `library-view.ts`.**
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5: UI.**
  - `Home`: arriba "Seguir leyendo" (tarjetas con portada y barra de progreso), debajo una grilla de series (la portada es la miniatura del primer tomo) y un botón "Subir". Las miniaturas se bajan con `downloadBlob` y se muestran con `URL.createObjectURL`.
  - `SeriesView`: lista de tomos con su estado. Acciones de la serie: renombrar, cambiar tipo, sentido y modo, y borrar (con confirmación). Acciones de cada tomo: mover a otra serie, cambiar número, "Marcar como leído", "Marcar como no leído" (que usa `resetProgress`) y borrar (con confirmación).
- [ ] **Step 6: Verificación manual** en la PC y en el celular: la grilla muestra portadas y las acciones se reflejan en Drive.
- [ ] **Step 7: Commit** `feat: biblioteca por series y Seguir leyendo`.

### Task 9: Lector

**Files:**
- Create: `src/lib/spread.ts`, `src/ui/Reader.tsx`, `tests/spread.test.ts`

**Interfaces:**
- Consumes: `Library`, `Store` (`loadProgress`, `saveProgress`, `resetProgress`), `Drive.downloadBlob`, `nextVolume`
- Produces:
  - `spreadAt(index: number, total: number, double: boolean): number[]`. En doble página, la portada (0) va sola y después los pares [1,2], [3,4]…; la última página puede quedar sola.
  - `step(index: number, total: number, double: boolean, delta: 1 | -1): number`. Devuelve el índice de la primera página del pliego siguiente o anterior, sin salirse del rango.
  - `tapZone(x: number, width: number, dir: 'rtl' | 'ltr'): 'next' | 'prev' | 'menu'`. El 30 % izquierdo y el 30 % derecho pasan de página y el centro abre el menú. En `rtl` el lado izquierdo es "next".

- [ ] **Step 1: Tests:**
  - `spreadAt(0, 10, true) → [0]`, `spreadAt(1, 10, true) → [1,2]`, `spreadAt(9, 10, true) → [9]`, `spreadAt(4, 10, false) → [4]`
  - `step(1, 10, true, 1) → 3`; `step(9, 10, true, 1) → 9`; `step(0, 10, false, -1) → 0`
  - `tapZone(10, 100, 'rtl') → 'next'`; `tapZone(10, 100, 'ltr') → 'prev'`; `tapZone(50, 100, 'ltr') → 'menu'`
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar `spread.ts`.**
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5: Implementar `Reader.tsx`.**
  - Al abrir, llamar a `loadProgress()` (directo de Drive) y saltar a `maxPage`.
  - La doble página se activa cuando `innerWidth > innerHeight && innerWidth >= 900`.
  - Modo `paged`: deslizar, tocar las zonas de `tapZone` o usar las flechas del teclado (en `rtl` las flechas también van invertidas).
  - Modo `vertical`: las imágenes una debajo de otra. La página actual es la que ocupa el centro del viewport (con IntersectionObserver).
  - Zoom con pellizco y con doble toque (CSS transform sobre la imagen; mientras hay zoom, se desactiva el deslizamiento de página).
  - Menú: título, "Página N / total", un slider para saltar, botones de tomo anterior y siguiente, y "Empezar de nuevo".
  - Precargar con `downloadBlob` las 3 páginas siguientes y revocar las object URLs de las páginas que quedan a más de 5 de distancia.
  - **Guardar el progreso:** `saveProgress` 3 s después del último cambio de página, y también en `visibilitychange → hidden` y `pagehide`. Por la regla de merge, guardar al cerrar no puede hacer retroceder el progreso. Al llegar a la última página se pone `finished = true` y se ofrece "Siguiente tomo" si `nextVolume` existe.
- [ ] **Step 6: Verificación manual con dos dispositivos.**
  - Leer un manga hasta la página 20 en la PC, abrirlo en el celular: tiene que abrir en la 20.
  - Leer hasta la 40 en el celular y después cerrar la pestaña de la PC, que había quedado en la 20. Abrir de nuevo en cualquiera: sigue en la 40.
  - Probar la doble página con la tablet acostada y el sentido derecha a izquierda en un manga.
- [ ] **Step 7: Commit** `feat: lector con modos página/vertical/doble y progreso sincronizado`.

### Task 10: Validación de riesgos en dispositivos reales

**Files:**
- Modify: `README.md` (sección "Probado en" con los resultados)

- [ ] **Step 1: Memoria.** Subir desde el iPhone un CBR o PDF de unos 150 MB. Criterio: la pestaña no se recarga sola y termina con la cantidad de páginas correcta. Si falla, bajar el render de PDF a 1400 px solo en iOS y volver a probar. Si sigue fallando, documentar "subir los archivos grandes desde la PC".
- [ ] **Step 2: Cuotas.** Subir un tomo de 200 páginas o más desde la PC. Criterio: termina sin error. Los reintentos que aparezcan en la consola se aceptan.
- [ ] **Step 3: Fluidez.** Con la precarga, pasar de página en el celular con 4G se siente instantáneo en 9 de cada 10 cambios.
- [ ] **Step 4: Token.** Dejar el lector abierto más de 1 h y pasar de página: tiene que seguir funcionando sin pedir login, o con un solo toque.
- [ ] **Step 5: Commit** `docs: resultados de validación en dispositivos`.
