# Verificación manual en dispositivos

Checklist para Franco, en el orden en que lo vas a hacer:

- **(a)** primero en la PC, con `npm run dev`;
- **(b)** después de publicar, en el iPhone, la tablet y la PC;
- **(c)** las pruebas de riesgo.

Marcá cada `- [ ]` cuando pase. Si algo falla, anotá qué pasó y en qué dispositivo (y la versión de iOS o de Android, si aplica). Los resultados de la sección (c) también van en la tabla "Probado en" del [README](../README.md).

Cada tarea que necesite probar algo en un dispositivo real agrega su sección acá.

---

## (a) Primero en la PC: `npm run dev`

Corré `npm run dev` y abrí `http://localhost:5173/#/dev/extract` (la página solo existe en desarrollo, no requiere iniciar sesión). Es la extracción de páginas (CBZ / CBR / PDF).

- [ ] **CBZ:** elegí un CBZ real. **Criterio:** la cantidad de páginas coincide con la del archivo y las miniaturas salen en orden de lectura (1, 2, 10, no 1, 10, 2).
- [ ] **CBR (RAR4):** elegí un CBR en formato RAR4. **Criterio:** misma cantidad y orden correctos.
- [ ] **CBR (RAR5):** elegí un CBR en formato RAR5 (si tenés uno). **Criterio:** misma cantidad y orden correctos.
- [ ] **PDF:** elegí un PDF. **Criterio:** una miniatura por página, en orden.
- [ ] **Miniaturas:** en todos los casos las miniaturas se ven nítidas y con la proporción correcta (esto cubre `makeThumb`, que no se puede probar en jsdom).
- [ ] **Formato no soportado:** elegí un archivo `.txt`. **Criterio:** aparece "Error: Formato no soportado".
- [ ] **RAR en build de producción:** Corré `npm run build && npm run preview` (o probá en el sitio desplegado, cuando la subida de la sección (b) esté publicada) con un CBR RAR4 y uno RAR5. **Criterio:** se extraen con la cantidad y orden correctos (se usa node-unrar-js; el `unrar-*.wasm` se sirve desde `assets/`).

### Interfaz nueva

Para revisar la interfaz sin sesión de Google abrí `http://localhost:5173/#/dev/mock` (solo existe en desarrollo): carga una biblioteca falsa en memoria, con portadas y páginas dibujadas, donde menús, diálogos y ajustes funcionan (la subida no). Probá a 375×812 y a 1400×900.

- [ ] **Buscador:** en la biblioteca escribí "pokemon". **Criterio:** filtra y encuentra "Pokémon" aunque no escribas la tilde; al borrar el texto vuelven todas las series.
- [ ] **⋮ de tomo:** en una serie tocá el ⋮ de un tomo. **Criterio:** el menú abre sin tapar ni desbordar la pantalla y ofrece cambiar número, mover, marcar leído / no leído y borrar.
- [ ] **Ajustes de serie:** abrí los ajustes de una serie. **Criterio:** se ven nombre, tipo, sentido y modo, y cada cambio se refleja en la serie.
- [ ] **Diálogos:** abrí un diálogo (borrar, renombrar). **Criterio:** Escape lo cierra, Tab no se escapa del diálogo y al cerrarlo el foco vuelve al botón que lo abrió.
- [ ] **Ajustes rápidos del lector:** en el lector tocá el centro y abrí los ajustes rápidos. **Criterio:** cambiar sentido, modo o doble página se aplica en el momento, sin salir del lector.
- [ ] **F / pantalla completa:** en el lector (PC) apretá `F`. **Criterio:** entra y sale de pantalla completa. Donde el navegador no la soporta (iPhone) no aparece el botón.
- [ ] **Nombre largo:** la serie de 60 caracteres, a 320 px de ancho. **Criterio:** sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).

---

## (b) Después de publicar

Requiere el sitio desplegado en GitHub Pages y el client ID configurado (ver README).

### Login de Google (iPhone)

- [ ] **Safari (pestaña):** abrí el sitio en Safari, tocá "Entrar con Google", elegí tu cuenta y aceptá el permiso. **Criterio:** volvés a la app y ves "Biblioteca" (sesión iniciada).
- [ ] **Safari, recarga:** recargá la página. **Criterio:** seguís con la sesión iniciada.
- [ ] **Pantalla de inicio:** en Safari, Compartir > "Agregar a pantalla de inicio". Abrí la app desde el ícono, tocá "Entrar con Google". **Criterio:** volvés a la app (no a Safari) y ves "Biblioteca" con sesión iniciada. En este modo la app usa el login por redirección.
- [ ] **Pantalla de inicio, reapertura:** cerrá la app por completo y abrila de nuevo. **Criterio:** sigue la sesión iniciada (o, si el token venció, se renueva sin pedirte nada más que, como mucho, un redirect rápido).
- [ ] **Salir:** tocá "Salir". **Criterio:** vuelve la pantalla "Entrar con Google".

Si falla el caso de la pantalla de inicio incluso con el login por redirección, anotá qué pasó y la versión de iOS: la alternativa documentada es usar la app desde Safari.

### Subida de tomos (Tarea 7)

- [ ] **Subida desde la PC:** en `#/upload` elegí (o arrastrá) un CBZ, confirmá serie y número y tocá "Subir". **Criterio:** en Drive existe `ComicReader/volumes/<id>/0001.jpg…` con `thumb.jpg`, y `library.json` tiene el tomo.
- [ ] **Subida desde el teléfono:** repetí con el selector de archivos. **Criterio:** igual resultado, sin recargas de la pestaña.
- [ ] **Corte a mitad de subida:** empezá una subida y cerrá la pestaña a la mitad. Al reabrir la app. **Criterio:** aparece "La subida de X se cortó, elegí el archivo de nuevo" y la carpeta parcial desaparece de Drive.
- [ ] **Duplicado:** subí otra vez el mismo número de la misma serie. **Criterio:** aparece "Reemplazar / Subir igual / Cancelar"; "Reemplazar" deja un solo tomo y borra la carpeta vieja en Drive.
- [ ] **Sesión vencida:** con la sesión vencida a mitad de subida. **Criterio:** mensaje "Tu sesión venció — tocá para renovar y volvé a subir el archivo".

### Biblioteca (Tarea 8)

- [ ] **Grilla (PC y celular):** abrí la app con tomos subidos. **Criterio:** "Series" muestra portadas (miniatura del primer tomo) y "Seguir leyendo" aparece solo si hay un tomo empezado, con barra de progreso.
- [ ] **Acciones de serie:** en una serie, renombrá, cambiá tipo/sentido/modo y borrá (con confirmación). **Criterio:** `library.json` en Drive refleja cada cambio; al borrar desaparecen las carpetas de los tomos.
- [ ] **Acciones de tomo:** cambiá el número, movelo a otra serie, "Marcar como leído" / "Marcar como no leído" y borrá. **Criterio:** el estado se ve en la lista, `progress.json` cambia, y la etiqueta sigue el formato `vNN` / `#NNN`.

### Lector (Tarea 9)

- [ ] **Doble página y sentido:** con la tablet acostada (ancho ≥ 900 px) abrí un manga `rtl`. **Criterio:** la portada va sola, después pares con la página impar a la derecha; tocar/deslizar/flechas avanzan hacia la izquierda.
- [ ] **Zoom:** pellizcá y hacé doble toque sobre una página. **Criterio:** hace zoom y se puede mover; mientras hay zoom, deslizar no pasa de página.
- [ ] **Modo vertical:** en una serie en modo vertical, scrolleá. **Criterio:** las imágenes cargan antes de llegar y "Página N / total" del menú (toque) sigue la del centro.
- [ ] **Menú y fin:** tocá el centro: título, slider, tomo anterior/siguiente y "Empezar de nuevo" (vuelve a la 1 y en otro dispositivo el tomo figura sin empezar). Al llegar a la última página aparece "Siguiente tomo". Escape vuelve a la serie.

### Interfaz en iPhone

- [ ] **Safe areas:** con la app instalada en la pantalla de inicio, abrí la biblioteca, una serie y el lector, en vertical y en horizontal. **Criterio:** nada queda tapado por el notch, la isla dinámica ni la barra inferior, y el menú del lector respeta los bordes.

### Dos dispositivos (PC y celular)

- [ ] **Progreso entre dispositivos:** leé un manga hasta la página 20 en la PC (esperá 3 s o cambiá de pestaña) y abrilo en el celular. **Criterio:** abre en la 20.
- [ ] **El progreso no retrocede:** leé hasta la 40 en el celular y después cerrá la pestaña de la PC, que había quedado en la 20. Abrí de nuevo en cualquiera. **Criterio:** sigue en la 40.
- [ ] **Recarga al volver:** cambiá algo desde otro dispositivo y volvé a la pestaña. **Criterio:** la lista se actualiza sola.

---

## (c) Pruebas de riesgo

Estas cuatro pruebas miden los riesgos conocidos del proyecto. Anotá el resultado en la tabla "Probado en" del README.

### Memoria: archivos de ~150 MB en iPhone (Spec §9.3)

- [ ] **Memoria (iPhone):** desde el iPhone, subí un CBR de ~150 MB y un PDF de ~150 MB. **Criterio:** la pestaña no se recarga sola y termina con la cantidad de páginas correcta.
  - Si falla con el PDF: bajá el render de PDF a 1400 px solo en iOS y volvé a probar.
  - Si sigue fallando: documentá "subir los archivos grandes desde la PC" como el plan para esos archivos, y probá la subida desde la PC en la sección (b).

### Cuotas: tomo de 200+ páginas

- [ ] **Cuotas (PC):** subí desde la PC un tomo de 200 páginas o más. **Criterio:** termina sin error. Los reintentos que aparezcan en la consola se aceptan.

### Fluidez con 4G

- [ ] **Fluidez (celular con 4G):** con la precarga activa, pasá de página en el celular conectado por 4G (contá 10 cambios). **Criterio:** se siente instantáneo en 9 de cada 10 cambios.

### Token: lector abierto más de 1 h

- [ ] **Token (celular):** dejá el lector abierto más de 1 h y pasá de página. **Criterio:** sigue funcionando sin pedir login, o con un solo toque.
