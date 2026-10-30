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
