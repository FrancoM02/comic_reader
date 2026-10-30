# Comic Reader

PWA para leer cómics guardados en tu Google Drive. Es 100% estática (GitHub Pages), sin backend. Pide únicamente el permiso `drive.file`: la app solo ve los archivos que ella misma crea o que vos le abrís.

## Desarrollo

```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Para desarrollar en local creá un `.env.local` con `VITE_GOOGLE_CLIENT_ID=<tu client id>`.

## Configuración (una sola vez)

### 1. Crear el repo público y activar Pages

GitHub Pages gratis requiere repo **público**.

1. En GitHub: New repository, público, nombre por ejemplo `comic_reader`. Subí el código.
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Cada push a `main` despliega en `https://<usuario>.github.io/<repo>/`.

### 2. Proyecto en Google Cloud

1. Entrá a <https://console.cloud.google.com/> y creá un proyecto nuevo (ej. "Comic Reader").
2. APIs & Services > Library > buscá **Google Drive API** > Enable.
3. APIs & Services > **OAuth consent screen** (Google Auth Platform):
   - User type: **External**.
   - Completá nombre de la app, email de soporte y email de contacto.
   - Scopes: agregá `.../auth/drive.file` (es un scope no sensible, no requiere verificación).
   - Publishing status: pasá a **In production** (si queda en "Testing", los tokens vencen a los 7 días y solo entran los usuarios de prueba).
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

### 4. Verificar en dispositivos

Seguí el checklist de [`docs/VERIFICACION.md`](docs/VERIFICACION.md), sobre todo la parte de iPhone.

## Notas sobre el login

- Navegadores normales: Google Identity Services (token client), con renovación silenciosa.
- iPhone con la app instalada en la pantalla de inicio (`navigator.standalone`): flujo por redirección (implicit flow), porque el popup no funciona bien en ese modo. Al volver, la app restaura la pantalla en la que estabas.
- Si algo de eso fallara en tu iPhone, la alternativa es usar la app desde Safari.
