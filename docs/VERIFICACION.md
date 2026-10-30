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
