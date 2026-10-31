# Comic Reader

PWA para leer cómics guardados en tu Google Drive. Es 100% estática (GitHub Pages), sin backend. Pide únicamente el permiso `drive.file`: la app solo ve los archivos que ella misma crea o que vos le abrís.

## Desarrollo

```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Para ver la interfaz sin iniciar sesión, abrí `http://localhost:5173/#/dev/mock` (solo en desarrollo): usa una biblioteca falsa en memoria.

Para desarrollar en local creá un `.env.local` con `VITE_GOOGLE_CLIENT_ID=<tu client id>`.

## Configuración (una sola vez)

### 1. Crear el repo público y activar Pages

GitHub Pages gratis requiere repo **público**.

1. En GitHub: New repository, público, nombre por ejemplo `comic_reader`. Subí el código.
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Cada push a `main` o `master` despliega en `https://<usuario>.github.io/<repo>/`.

### 2. Proyecto en Google Cloud

1. Entrá a <https://console.cloud.google.com/> y creá un proyecto nuevo (ej. "Comic Reader").
2. APIs & Services > Library > buscá **Google Drive API** > Enable.
3. APIs & Services > **OAuth consent screen** (Google Auth Platform):
   - User type: **External**.
   - Completá nombre de la app, email de soporte y email de contacto.
   - Scopes: agregá `.../auth/drive.file` (es un scope no sensible, no requiere verificación).
   - Publishing status: o bien agregá tu cuenta de Google en **Test users** (en "Testing" solo pueden entrar los usuarios de prueba listados), o bien pasá la app a **In production**.
4. APIs & Services > Credentials > Create credentials > **OAuth client ID** > Application type: **Web application**.
   - **Authorized JavaScript origins:**
     - `https://<usuario>.github.io` (solo el origen, sin ruta ni barra final)
     - `http://localhost:5173` (para desarrollo)
   - **Authorized redirect URIs** (los usa el login por redirección del iPhone instalado en la pantalla de inicio):
     - `https://<usuario>.github.io/<repo>/` (URL exacta de la app, con la barra final)
     - `http://localhost:5173/` (opcional, para probar el flujo en desarrollo)
5. Copiá el **Client ID**. No es un secreto: va embebido en el sitio.

### 3. Guardar el Client ID en el repo

Settings > Secrets and variables > Actions > pestaña **Variables** > New repository variable:

- Name: `VITE_GOOGLE_CLIENT_ID`
- Value: el Client ID

Si falta, el deploy falla con un mensaje claro.

### 3b. (Recomendado) Worker de login: no reloguear cada hora

Sin esto, el token de Google dura 1 h y la app te pide renovar seguido. Con el Worker de [`worker/`](worker/) la app guarda un *refresh token* y renueva sola con un fetch, sin popup. Cloudflare Workers gratis no pide tarjeta.

1. En el OAuth client de Google Cloud (paso 2.4), agregá en **Authorized redirect URIs**: `https://comic-reader-auth.<tu-subdominio>.workers.dev/callback`. Copiá también el **Client secret**.
2. En OAuth consent screen, pasá la app a **In production**. En "Testing" Google vence el refresh token a los 7 días.
3. Desplegá el Worker (revisá `APP_URL` en `worker/wrangler.toml`):
   ```
   cd worker
   npx wrangler login
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler deploy
   ```
4. En GitHub, Variables: `VITE_AUTH_WORKER_URL` = la URL que imprimió `wrangler deploy` (ej. `https://comic-reader-auth.<tu-subdominio>.workers.dev`). Volvé a desplegar.

Si la variable no está, la app usa el login de antes (GIS / redirección). El refresh token queda en `localStorage`: solo sirve a través del Worker y se revoca al cerrar sesión.

### 4. Verificar en dispositivos

Seguí el checklist de [`docs/VERIFICACION.md`](docs/VERIFICACION.md), sobre todo la parte de iPhone.

## Notas sobre el login

- Con el Worker configurado (paso 3b): entrás una vez y la app renueva el token sola cada hora, en cualquier navegador e iPhone instalado. Solo vuelve a pedir login si revocás el acceso o pasan ~6 meses sin usarla.
- Navegadores normales: Google Identity Services (token client). El token dura una hora; la app intenta renovarlo sola, pero la renovación puede pedirte un toque más o menos una vez por hora (aparece "Tocá para renovar"). Mientras el token siga vigente, la app sigue funcionando aunque el aviso esté visible. Al empezar una subida, si al token le queda poco, se renueva en ese momento.
- iPhone con la app instalada en la pantalla de inicio (`navigator.standalone`): flujo por redirección (implicit flow), porque el popup no funciona bien en ese modo. Renovar implica salir a Google y volver (la app restaura la pantalla en la que estabas); nunca lo hace mientras hay una subida o progreso de lectura sin guardar.
- Si algo de eso fallara en tu iPhone, la alternativa es usar la app desde Safari.

## Probado en

Resultados de las pruebas de riesgo en dispositivos reales. Completá la columna "Resultado" y las notas. Los pasos completos están en la sección (c) de [`docs/VERIFICACION.md`](docs/VERIFICACION.md).

| Prueba | Dispositivo | Resultado | Notas |
| --- | --- | --- | --- |
| Memoria: CBR de ~150 MB | iPhone | | |
| Memoria: PDF de ~150 MB | iPhone | | |
| Cuotas: tomo de 200+ páginas | PC (Linux) | | |
| Fluidez: cambio de página con 4G (9 de 10) | Celular con 4G | | |
| Token: lector abierto más de 1 h | Celular | | |
