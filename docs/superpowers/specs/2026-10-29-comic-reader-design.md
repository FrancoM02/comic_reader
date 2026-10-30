# Comic Reader — Diseño

Fecha: 2026-10-29
Estado: borrador para aprobación

## 1. Intención y por qué

Franco lee manga y cómics en Tachimanga, pero las fuentes de esa app no tienen
lo que él quiere o lo tienen sólo en inglés. Consigue sus propios archivos
(CBZ, CBR, PDF) y necesita un lugar donde subirlos y leerlos **desde cualquier
dispositivo**: iPhone, tablet Android y PCs con Linux.

Quiere su **propio lector**, y que si deja un tomo por la mitad en un
dispositivo, en otro se abra en la misma página.

## 2. Objetivos

- Leer CBZ, CBR y PDF desde el navegador en iPhone (Safari), Android (Chrome) y
  Linux (cualquier navegador moderno).
- Subir y borrar tomos **desde la propia app**. El usuario nunca maneja
  carpetas a mano.
- Retomar donde dejó: el progreso por tomo se sincroniza entre dispositivos.
- Biblioteca organizada por **serie → tomo/issue**, armada automáticamente a
  partir del nombre del archivo y corregible a mano.
- **$0 de costo, sin tarjeta**, y sin depender de ninguna PC prendida.
- Que sea **privada**: solo Franco ve su biblioteca.

## 3. No-objetivos

- **Lectura offline.** Franco siempre tiene conexión. No hay descargas al
  dispositivo ni cola de sincronización.
- **Multiusuario.** Es para una sola persona (su cuenta de Google).
- **Integración con Comic Vault** (la app de catálogo local en Flask). Queda
  para una etapa posterior.
- **Biblioteca grande o permanente.** Son pocos tomos que rotan: se suben, se
  leen y casi siempre se borran.
- Buscar o descargar contenido de internet (no es un Tachimanga). Solo se lee
  lo que sube el usuario.
- Agrupaciones por encima de la serie (editorial, evento, etiquetas, listas).

## 4. Anti-objetivos (cosas que lo harían un fracaso aunque "funcione")

- Que cueste plata o pida cargar una tarjeta.
- Que requiera una PC prendida 24/7.
- Que abrir un tomo en el celular implique bajar el archivo entero (100+ MB)
  cada vez.
- Que la biblioteca sea accesible para cualquiera que tenga el link.
- Que el progreso se pierda o "salte para atrás" al cambiar de dispositivo.

## 5. Restricciones

- Hosting gratuito de sitio estático: GitHub Pages o Cloudflare Pages, a
  elección del constructor. No hay servidor propio.
- Almacenamiento: **Google Drive del usuario** (15 GB gratis). Acceso a la
  API de Drive directamente desde el navegador, con OAuth de Google.
- Debe funcionar instalada como **PWA** ("agregar a pantalla de inicio") en
  iOS y Android, y también en una pestaña normal del navegador.
- Formatos de entrada: `.cbz` (ZIP), `.cbr` (RAR, incluido RAR5) y `.pdf`.

## 6. Enfoques considerados

| Enfoque | Qué es | A favor | En contra |
|---|---|---|---|
| **A. Sitio estático + Google Drive** ✅ elegido | SPA/PWA estática; tomos y progreso guardados en el Drive del usuario vía API | $0 real, sin tarjeta, sin backend, privacidad dada por el login de Google, pocas piezas | Hay que configurar un proyecto en Google Cloud Console una vez; los tokens se renuevan cada ~1 h; el login en una PWA de iOS es delicado (ver §9) |
| B. Todo en Cloudflare (Pages + Workers + R2 + D1) | Backend propio en Workers; archivos en R2; progreso en D1 | Más rápido, más flexible, más fácil de integrar con Comic Vault más adelante | R2 exige cargar una tarjeta; más piezas; la autenticación hay que hacerla a mano |
| C. Supabase (descartado) | Storage + Postgres + Auth | Trae auth incluida | 1 GB gratis, **límite de 50 MB por archivo** (un tomo de manga suele pasarlo), el proyecto se pausa tras una semana sin uso |
| D. Servidor en la PC + túnel (descartado) | Komga/Kavita o Comic Vault expuestos con Tailscale | Simple; integración directa con Vault | Requiere la PC prendida: lo descarta un anti-objetivo |

**Elegido: A.** Franco lo eligió porque cumple todas las restricciones con la
menor cantidad de piezas, y su cuenta de Google ya está en todos sus
dispositivos.

## 7. Lo que ya está decidido

### 7.1 Plataforma
- Web app instalable (PWA): una sola base de código para los tres sistemas
  operativos. *(Decisión de Claude, aceptada en la conversación.)*
- Login con Google (Google Identity Services, flujo de token en el
  navegador). La app pide el scope **`drive.file`**, que solo da acceso a los
  archivos que la propia app crea. *(Decisión de Claude: es un scope no
  sensible, así que no hace falta la verificación de Google y la app no puede
  tocar el resto del Drive.)*

### 7.2 Subida y conversión ("explotar" el tomo al subirlo)
*(Decisión de Claude, aceptada en la conversación.)*
- Al subir un archivo, **el navegador lo convierte en páginas sueltas**
  antes de mandarlo a Drive:
  - CBZ: se descomprime (ZIP).
  - CBR: se descomprime con una librería de RAR en WebAssembly (por ejemplo
    libarchive.js), con soporte para RAR5.
  - PDF: cada página se renderiza a imagen con pdf.js.
- Las páginas se ordenan con orden natural por nombre (`2.jpg` antes que
  `10.jpg`). Se ignoran los archivos que no son imagen (`ComicInfo.xml`,
  `Thumbs.db`, `__MACOSX/`, etc.).
- Las imágenes que ya son JPEG/PNG/WebP se suben **tal cual**, sin
  recomprimirlas. Las páginas que salen de un PDF se generan como JPEG o WebP
  de calidad alta, con un ancho de unos 1600–2000 px.
- Se genera una **miniatura** de la primera página para usarla de portada.
- El archivo original **no se guarda**: solo quedan las páginas.
- La subida muestra una barra de progreso y sube varias páginas en paralelo,
  con pocas a la vez para no chocar con los límites de la API.
- **Subida interrumpida → se empieza de cero** *(decidido por Franco)*. Un tomo
  se agrega a `library.json` solo cuando todas sus páginas terminaron de
  subirse. Mientras tanto, la app anota en el dispositivo cuál es la carpeta
  `volumes/<volumeId>/` en curso. Si al abrirse encuentra una subida que quedó
  a medias (o carpetas en `volumes/` que no figuran en `library.json`), borra
  esas páginas y avisa: "La subida de X se cortó, elegí el archivo de nuevo".
  No se guarda una copia del archivo original en el dispositivo y no se puede
  retomar la subida.
- Se puede subir desde la PC (arrastrar y soltar o elegir el archivo) y desde
  el celular o la tablet (selector de archivos). También se pueden elegir
  varios archivos juntos.

### 7.3 Estructura en Drive (la maneja la app; el usuario no la toca)
```
ComicReader/                      (carpeta raíz creada por la app)
├── library.json                  (índice: series, tomos, metadatos)
├── progress.json                 (progreso por tomo)
└── volumes/
    └── <volumeId>/
        ├── thumb.webp
        ├── 0001.jpg
        ├── 0002.jpg
        └── ...
```
- `library.json` guarda, por serie: id, nombre, tipo (`manga` | `comic`),
  sentido de lectura y modo de lectura. Por tomo: id, id de serie, número,
  etiqueta (`v03` o `#045`), cantidad de páginas, ids de los archivos de
  Drive de cada página (para no tener que listar carpetas al leer) y fecha de
  subida.
- `progress.json` guarda, por tomo: `{ page, totalPages, updatedAt,
  deviceId, finished }`.

### 7.4 Organización de la biblioteca
- **Serie → tomos/issues**, ordenados por número.
- Al subir, la app **saca la serie y el número del nombre del archivo**:
  - `Chainsaw Man v03.cbz` → *Chainsaw Man*, tomo 3
  - `Batman (2016) #045.cbr` → *Batman (2016)*, issue 45
  - También se reconocen variantes comunes: `Vol. 3`, `Tomo 3`, `T03`,
    `c045`, `045`, `_` o `.` usados como separadores, y etiquetas de grupo
    entre corchetes como `[Grupo] Serie v01`, que se descartan.
- Antes de subir se muestra una **pantalla de confirmación** con la serie y el
  número detectados. Ahí se pueden editar, o elegir una serie existente de
  una lista.
- Si la serie no existe, se crea, y se pregunta su tipo (manga o cómic).
  Ese tipo define el sentido de lectura por defecto.
- Edición posterior: renombrar una serie, mover un tomo a otra serie, cambiar
  el número de un tomo y cambiar el tipo, sentido o modo de una serie.
- Borrar: un tomo o una serie entera. Se borra todo de Drive, y la app pide
  confirmación antes.

### 7.5 Lector
- **Modo página**: una página a la vez. Se pasa deslizando, tocando los
  costados o con las flechas del teclado en la PC.
  - **Derecha a izquierda** para manga e **izquierda a derecha** para cómic.
    Cada serie recuerda su sentido.
- **Modo scroll vertical continuo**, para webtoons y manhwa (opción por serie).
- **Doble página** en pantallas apaisadas anchas (la tablet acostada o la PC):
  dos páginas lado a lado, respetando el sentido de lectura.
- Zoom con pellizco y con doble toque.
- Al tocar el centro se muestra u oculta una barra con: título, número de
  página, deslizador para saltar a una página, y botones de siguiente y
  anterior tomo.
- Se **precargan** las 2 o 3 páginas siguientes.
- Al terminar un tomo, la app ofrece abrir el siguiente de la serie.

### 7.6 Progreso y "Seguir leyendo"
- La pantalla principal muestra arriba **"Seguir leyendo"** (los tomos
  empezados y no terminados, el más reciente primero, con barra de progreso),
  y debajo la **biblioteca por series**.
- Cada tomo muestra si está sin leer, a medias (con porcentaje) o leído.
- El progreso se guarda **mientras se lee**, con un pequeño retraso para no
  escribir en cada página (por ejemplo, unos segundos después del último
  cambio), y también al salir o cerrar el lector.
- Al abrir un tomo, la app **vuelve a leer `progress.json` desde Drive**
  (nunca usa una copia vieja) y salta a la página guardada.
- **Regla "el progreso nunca retrocede"** *(decidido por Franco)*. Al guardar,
  la app lee el archivo remoto y combina tomo por tomo, quedándose con la
  **página más avanzada** (y con `finished` si alguno lo tiene). Así, una
  pestaña vieja que guarda al cerrarse no puede pisar lo que se leyó en otro
  dispositivo, y no importa si los relojes de los dispositivos no coinciden.
- **Retroceder a propósito** solo se hace con una acción explícita: "Empezar
  de nuevo" o "Marcar como no leído". Esa acción sube un contador `resetGen`
  en el tomo. En la combinación, gana siempre la entrada con `resetGen` más
  alto. Solo cuando dos entradas tienen el mismo `resetGen` se usa la regla de
  la página más avanzada. Volver páginas para atrás dentro del lector **no**
  baja el progreso guardado.
- Campos de cada tomo en `progress.json`: `{ maxPage, totalPages, finished,
  resetGen, updatedAt, deviceId }`. `updatedAt` se usa solo para ordenar
  "Seguir leyendo", no para resolver conflictos.
- Marcar como leído (pone `finished = true`) o como no leído (es un reset) a
  mano.

## 8. Lo que queda a criterio del constructor

- Framework del frontend (o ninguno), bundler y librería de estilos.
- Elegir entre GitHub Pages y Cloudflare Pages.
- Qué librerías usar para ZIP, RAR y PDF, siempre que cumplan §7.2.
- Diseño visual. Pautas: tema oscuro por defecto y portadas grandes en la
  grilla.
- Las reglas exactas del parser de nombres, más allá de los ejemplos de §7.4.
- Cuántas subidas en paralelo y cómo reintentar ante errores 403/429 de Drive.
- Si las imágenes de las páginas se cachean en memoria o con el Service
  Worker durante la sesión de lectura. Sin modo offline: ver §3.
- Guía paso a paso (en el README) para crear el proyecto en Google Cloud
  Console: pantalla de consentimiento, client ID web y orígenes autorizados.
  Es una tarea de una sola vez que hace Franco.

## 9. Riesgos a validar temprano

1. **Login de Google dentro de una PWA instalada en iOS.** En modo standalone,
   iOS maneja mal los popups: pueden abrirse en Safari y no volver a la app.
   Esto hay que probarlo en un iPhone real antes de construir lo demás. La
   alternativa es el flujo OAuth implícito por redirección
   (`response_type=token`), que no necesita backend. Si nada funciona, la app
   en iOS se usa desde Safari sin instalarla.
2. **Renovación del token.** Los tokens de acceso duran alrededor de 1 hora.
   La app tiene que renovarlos en silencio, o con un toque si no se puede,
   sin perder el progreso ni cortar una subida.
3. **Memoria en el celular al convertir.** Explotar un PDF o un CBR grande en
   un iPhone puede agotar la memoria. Hay que procesar las páginas de a una
   (sin cargar todas a la vez) y probarlo con un tomo de 150 MB.
4. **Límites de la API de Drive.** Un tomo de 200 páginas son 200 archivos
   subidos. Hay que confirmar que con pocas subidas en paralelo y reintentos
   con espera creciente no aparecen errores de cuota.
5. **Velocidad de lectura.** Cada página se baja con `files.get?alt=media`.
   Hay que medir que pasar de página se sienta instantáneo con la precarga.
