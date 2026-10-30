# Verificación manual en dispositivos

Checklist para Franco. Cada tarea que necesite probar algo en un dispositivo real agrega su sección acá.

## Login de Google (iPhone)

Requiere el sitio desplegado en GitHub Pages y el client ID configurado (ver README).

- [ ] **Safari (pestaña):** abrí el sitio en Safari, tocá "Entrar con Google", elegí tu cuenta y aceptá el permiso. **Criterio:** volvés a la app y ves "Biblioteca" (sesión iniciada).
- [ ] **Safari, recarga:** recargá la página. **Criterio:** seguís con la sesión iniciada.
- [ ] **Pantalla de inicio:** en Safari, Compartir > "Agregar a pantalla de inicio". Abrí la app desde el ícono, tocá "Entrar con Google". **Criterio:** volvés a la app (no a Safari) y ves "Biblioteca" con sesión iniciada. En este modo la app usa el login por redirección.
- [ ] **Pantalla de inicio, reapertura:** cerrá la app por completo y abrila de nuevo. **Criterio:** sigue la sesión iniciada (o, si el token venció, se renueva sin pedirte nada más que, como mucho, un redirect rápido).
- [ ] **Salir:** tocá "Salir". **Criterio:** vuelve la pantalla "Entrar con Google".

Si falla el caso de la pantalla de inicio incluso con el login por redirección, anotá qué pasó y la versión de iOS: la alternativa documentada es usar la app desde Safari.

## Extracción de páginas (CBZ / CBR / PDF)

Corré `npm run dev` y abrí `http://localhost:5173/#/dev/extract` (la página solo existe en desarrollo, no requiere iniciar sesión).

- [ ] **CBZ:** elegí un CBZ real. **Criterio:** la cantidad de páginas coincide con la del archivo y las miniaturas salen en orden de lectura (1, 2, 10, no 1, 10, 2).
- [ ] **CBR (RAR4):** elegí un CBR en formato RAR4. **Criterio:** misma cantidad y orden correctos.
- [ ] **CBR (RAR5):** elegí un CBR en formato RAR5 (si tenés uno). **Criterio:** misma cantidad y orden correctos.
- [ ] **PDF:** elegí un PDF. **Criterio:** una miniatura por página, en orden.
- [ ] **Miniaturas:** en todos los casos las miniaturas se ven nítidas y con la proporción correcta (esto cubre `makeThumb`, que no se puede probar en jsdom).
- [ ] **Formato no soportado:** elegí un archivo `.txt`. **Criterio:** aparece "Error: Formato no soportado".
- [ ] **Memoria (iPhone):** con un PDF o CBR de ~150 MB, la extracción termina sin que Safari recargue la pestaña.

### Extracción: memoria y build de producción

- [ ] **Spec §9.3 (iPhone):** subí un CBR de ~150 MB y un PDF de ~150 MB. **Criterio:** la pestaña no se recarga y la cantidad de páginas es correcta. Si falla, anotarlo: el plan alternativo es "subir archivos grandes desde la PC".
- [ ] **RAR en build de producción:** `#/dev/extract` solo prueba la rama de desarrollo del worker. Corré `npm run build && npm run preview` (o probá en el sitio desplegado cuando la Tarea 7 tenga la subida) con un CBR RAR4 y uno RAR5. **Criterio:** se extraen con la cantidad y orden correctos (el worker y el .wasm se sirven desde `libarchive/`).

## Subida de tomos (Tarea 7)

- [ ] **Subida desde la PC:** en `#/upload` elegí (o arrastrá) un CBZ, confirmá serie y número y tocá "Subir". **Criterio:** en Drive existe `ComicReader/volumes/<id>/0001.jpg…` con `thumb.jpg`, y `library.json` tiene el tomo.
- [ ] **Subida desde el teléfono:** repetí con el selector de archivos. **Criterio:** igual resultado, sin recargas de la pestaña.
- [ ] **Corte a mitad de subida:** empezá una subida y cerrá la pestaña a la mitad. Al reabrir la app. **Criterio:** aparece "La subida de X se cortó, elegí el archivo de nuevo" y la carpeta parcial desaparece de Drive.
- [ ] **Duplicado:** subí otra vez el mismo número de la misma serie. **Criterio:** aparece "Reemplazar / Subir igual / Cancelar"; "Reemplazar" deja un solo tomo y borra la carpeta vieja en Drive.
- [ ] **Sesión vencida:** con la sesión vencida a mitad de subida. **Criterio:** mensaje "Tu sesión venció — tocá para renovar y volvé a subir el archivo".

## Biblioteca (Tarea 8)

- [ ] **Grilla (PC y celular):** abrí la app con tomos subidos. **Criterio:** "Series" muestra portadas (miniatura del primer tomo) y "Seguir leyendo" aparece solo si hay un tomo empezado, con barra de progreso.
- [ ] **Acciones de serie:** en una serie, renombrá, cambiá tipo/sentido/modo y borrá (con confirmación). **Criterio:** `library.json` en Drive refleja cada cambio; al borrar desaparecen las carpetas de los tomos.
- [ ] **Acciones de tomo:** cambiá el número, movelo a otra serie, "Marcar como leído" / "Marcar como no leído" y borrá. **Criterio:** el estado se ve en la lista, `progress.json` cambia, y la etiqueta sigue el formato `vNN` / `#NNN`.
- [ ] **Recarga al volver:** cambiá algo desde otro dispositivo y volvé a la pestaña. **Criterio:** la lista se actualiza sola.
