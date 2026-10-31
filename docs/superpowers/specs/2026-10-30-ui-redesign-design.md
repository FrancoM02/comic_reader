# Rediseño de la interfaz — diseño

Fecha: 2026-10-30. Complementa a `2026-10-29-comic-reader-design.md`, que sigue vigente para todo lo que no sea interfaz.

## Intención

La app ya funciona (login, Drive, subida, lector, progreso), pero la interfaz es HTML casi sin diseño: botones azules sueltos, una pared de botones por tomo en la vista de serie, formularios planos al subir. Franco la usa a diario desde un iPhone (PWA), una tablet Android y PCs Linux, y viene de Tachimanga. Quiere que se sienta como una app de lectura de verdad: portadas grandes, acciones escondidas hasta que se necesitan, lector limpio con controles al tocar.

Franco aprobó dos maquetas (celular y PC) durante la conversación; este documento las describe.

## Objetivos

- Biblioteca, serie, subida y lector con el aspecto de las maquetas, en celular y en PC.
- Un único diseño responsive: celular por debajo de 900 px de ancho, PC desde 900 px.
- Funciones nuevas que las maquetas muestran: buscador de series, contador de tomos sin leer, menú ⋮ por tomo, ajustes rápidos en el lector, pantalla completa, tarjetas de subida editables, diálogos propios en lugar de `prompt`/`confirm`.

## No objetivos

- No cambia nada de Drive, auth, store, progreso, extracción ni formato de `library.json`/`progress.json`.
- No hay tema claro: la app sigue siendo oscura.
- No hay portadas reales nuevas: se usan las `thumb.jpg` que ya existen.
- Sin ordenamientos configurables ni filtros más allá del buscador por nombre.

## Anti-objetivos (sería un fracaso aunque ande)

- Que la app se vuelva pesada o lenta en el iPhone (nada de librerías de UI ni frameworks de CSS).
- Que algo que hoy funciona deje de funcionar: los 125 tests deben seguir pasando (se permite ajustar textos o selectores en los tests de UI cuando el texto cambia a propósito, nunca la lógica que verifican).
- Que una acción destructiva (borrar tomo/serie) quede a un toque sin confirmación.

## Restricciones

- Preact + TypeScript strict, Vite, Vitest + jsdom, como ahora. Sin dependencias nuevas.
- Estilos en `src/ui/styles.css` (CSS plano con variables). Íconos como componentes SVG inline en `src/ui/icons.tsx`.
- Debe andar en Safari iOS (PWA standalone), Chrome Android y Firefox Linux.
- Textos en español rioplatense, como el resto de la app.

## Enfoques considerados

- **A. CSS propio + íconos SVG a mano** (elegido por Franco). Sin dependencias, mantiene la app liviana y la convención actual de CSS plano. Contra: unos ~20 íconos escritos a mano.
- **B. Tailwind + lucide.** Iteración de estilos más rápida y cientos de íconos, pero suma dos dependencias y un paso de build para cinco pantallas. Descartado.

## Diseño visual (común)

- Fondo `#121212`, superficies `#1b1b1b`/`#1e1e1e`, bordes `#262626`–`#333`, texto `#eee`, secundario `#999`/`#aaa`, acento `#4f8cff` (el azul actual), peligro `#F09595` para texto y `#b3402f` para fondo.
- Portadas en proporción 2:3, esquinas 6 px. Barra de progreso fina (3 px) en acento.
- Un solo botón primario (relleno acento) por pantalla; el resto, botones de ícono o "fantasma".
- Áreas táctiles de al menos 44 px en celular. Respetar `env(safe-area-inset-*)` en barras fijas (notch del iPhone).

## Pantallas

**Estructura en PC (decisión del que escribe):** la barra lateral es un contenedor común a Biblioteca, Serie y Subir (no al lector, que ocupa toda la pantalla). En Serie y Subir hay además un ← en la cabecera del contenido. En celular no hay barra lateral; cada pantalla tiene su barra superior.

**Corte de diseño (decisión del que escribe):** las barras/estructura de PC se usan con ancho ≥ 900 px, sin importar la orientación. La doble página del lector mantiene su regla actual (ancho ≥ 900 y apaisado).

### Biblioteca (`#/`)

**Celular:** barra superior con "Biblioteca", ícono de búsqueda y ⋮ (el ⋮ contiene "Salir"). Tocar la lupa despliega un campo de texto en la barra. Debajo, "Seguir leyendo": fila horizontal desplazable de portadas con barra de progreso y texto `Tomo 4 · p. 112/180` (o la etiqueta del tomo cuando no es tomo, como `#12`). Después, "Series": grilla de 3 columnas de portadas con el nombre sobre la portada y un globito con la cantidad de tomos sin terminar (no `finished`). Botón flotante **+** abajo a la derecha que lleva a `#/upload`.

**PC:** barra lateral fija (~150 px) con: nombre de la app, Biblioteca, Seguir leyendo, Subir, y Salir abajo. Contenido: título, buscador siempre visible, botón primario "Subir". "Seguir leyendo" como tarjetas horizontales (miniatura chica + nombre + progreso) en 3 columnas. Series en grilla de portadas con más columnas (auto-fill, ~110 px mínimo).

- El buscador filtra series por nombre, sin distinguir mayúsculas ni acentos, en el cliente.
- "Seguir leyendo" en la barra lateral lleva a la sección de la biblioteca (ancla/scroll), no a una página nueva.
- La serie toma como portada la del primer tomo, como hoy. Las portadas recortan para llenar el 2:3 (`object-fit: cover`), como hoy.
- Las alertas actuales (errores, "La subida de X se cortó") siguen apareciendo en la biblioteca, con estilo de aviso.

### Serie (`#/series/<id>`)

**Celular:** barra superior con ←, ⚙ (ajustes de serie) y nada más. Cabecera: portada (~84 px) + nombre + `Manga · 12 tomos · 3 leídos` + chips de sentido y modo. Botón primario ancho "Seguir: Tomo 4, p. 112" que abre el tomo que corresponde (el que se está leyendo más recientemente en esa serie; si no hay, el primer tomo no terminado; si todos están leídos, el botón dice "Leer de nuevo" y abre el primero). Lista de tomos: miniatura, etiqueta, barra de progreso/estado (`Leído`, `62%`, `Sin leer`), ⋮. Los tomos leídos se ven atenuados.

El ⋮ de un tomo abre un **panel que sube desde abajo** con: Marcar como leído / no leído (según estado), Cambiar número, Mover a otra serie, Borrar tomo (en rojo).

El ⚙ abre el mismo tipo de panel con: Renombrar, Tipo (manga/cómic), Sentido, Modo, Borrar serie.

**PC:** dos columnas. Izquierda (~190 px): portada grande, nombre, datos, chips y botón "Seguir". Derecha: tabla de tomos (miniatura, tomo, progreso, estado, ⋮). El ⋮ abre un **menú desplegable** junto al botón, con las mismas opciones. Los ajustes de serie se abren desde un ícono junto a los chips.

- Tocar un chip abre los ajustes de serie (no cambia el valor directamente).
- En los ajustes de serie, Tipo, Sentido y Modo son selectores segmentados dentro del mismo panel (dos opciones cada uno, se aplica al tocar, el panel queda abierto). Se mantiene la regla actual: cambiar Tipo pone el Sentido por defecto (manga → der. a izq., cómic → izq. a der.); después el sentido se puede cambiar a mano. Renombrar y Borrar serie abren el diálogo. (Decisión del que escribe.)
- Tomo de "Seguir" (decisión del que escribe): se usa `continueReading` filtrado por la serie (mismo criterio que la biblioteca: `maxPage > 0` y no terminado); si no da nada, el primer tomo no terminado en orden; si todos están terminados, "Leer de nuevo" con el primero.
- "Mover a otra serie" muestra la lista de series en el panel/menú.

### Diálogos

Un componente de diálogo propio reemplaza `prompt()` y `confirm()`: renombrar serie, cambiar número, confirmar borrado y el aviso de duplicado al subir. Centrado en pantalla con fondo oscurecido, en celular y en PC. Debe poder cerrarse con Esc y tocando afuera (equivale a cancelar). El borrado siempre pide confirmación en el diálogo con el botón de confirmar en rojo.

### Lector (`#/read/<id>`)

Comportamiento de lectura sin cambios (gestos, zoom, zonas de toque, doble página automática, vertical, progreso). Cambia el menú que aparece al tocar el centro:

**Celular:** barra superior: ← y nombre de serie + etiqueta del tomo (sin ícono de ajustes: los ajustes están en la barra inferior). Barra inferior: botones tomo anterior/siguiente a los lados de la barra de páginas (con número actual y total) y fila de ajustes rápidos: Sentido, Vertical/Páginas, Empezar de nuevo. "Doble página" solo aparece cuando la pantalla es ancha.

**PC:** barra superior con ←, título y los ajustes como chips: sentido, páginas/vertical, doble página, pantalla completa y empezar de nuevo (no se pierde ninguna función de hoy). Barra inferior con "Tomo anterior" · barra de páginas · "Tomo siguiente". Indicación discreta de atajos: `← → páginas · F pantalla completa · Esc volver`.

- Sentido y modo cambian la serie (se guardan en `library.json`, como hoy desde la vista de serie) y se aplican en el acto.
- Doble página: preferencia por dispositivo en `localStorage` (`auto` / `nunca`); `auto` es el comportamiento actual. No se sube a Drive.
- Pantalla completa: API Fullscreen sobre el documento; tecla F la alterna. Si `document.fullscreenEnabled` es falso (iPhone), el botón no aparece.
- "Progreso sin guardar" y errores siguen visibles en el menú.
- "Fin del tomo / Siguiente tomo" al final se mantiene, con el estilo nuevo.

### Subir (`#/upload`)

Barra superior con ✕ (vuelve a la biblioteca; mientras sube, deshabilitado con aviso) y "Subir". Zona grande con borde punteado: "Tocá para elegir archivos — o arrastralos acá · CBZ, CBR, PDF"; tocarla abre el selector (el `<input type=file>` queda oculto pero accesible). Arrastrar archivos a toda la pantalla sigue funcionando.

Cada archivo es una tarjeta: serie detectada (con etiqueta "nueva" si no existe), `Tomo N` o etiqueta, tipo si es nueva, nombre del archivo, estado a la derecha (`Listo` en verde, `48/192 pág.` mientras sube, error en rojo) y barra de progreso. Un lápiz despliega los campos editables (serie con sugerencias, número, tipo si es nueva). Tarjetas con serie vacía se muestran abiertas y marcadas. Botón primario fijo abajo: "Subir N archivos" / "Subiendo 2 de 3…". El aviso de duplicado usa el diálogo propio (Reemplazar / Subir igual / Cancelar).

### Pantallas sueltas

Login, "Cargando…", "No se pudo abrir tu biblioteca" y el aviso de sesión vencida reciben el estilo nuevo (centrados, botón primario), sin cambiar textos ni comportamiento.

## Lo que queda a criterio del que construye

- Cómo dividir los componentes (por ejemplo `Sheet`, `Dialog`, `TopBar`, `Cover`) y dónde vive el CSS de cada uno dentro de `styles.css`.
- El dibujo exacto de cada ícono y las medidas finas que no fija este documento.
- Animaciones: como mucho transiciones cortas (≤200 ms) en paneles y diálogos, respetando `prefers-reduced-motion`.
- Tests nuevos para la lógica nueva no trivial: filtro del buscador, cálculo del tomo para "Seguir", contador de sin leer, preferencia de doble página.
