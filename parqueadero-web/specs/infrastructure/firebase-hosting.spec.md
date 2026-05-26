# Infraestructura: Firebase Hosting del frontend

**Tipo:** infrastructure
**Estado:** draft (Fase 10 — Deploy productivo)
**Versión:** 1.0
**Fecha:** 2026-05-20

## 1. Propósito

Servir `parqueadero-web` (Angular 18 PWA, CSR) desde Firebase Hosting como sitio estático con SPA fallback y service worker habilitado.

## 2. Alcance

- **Incluye:** configuración `firebase.json` + `.firebaserc`, comandos de build/deploy, reglas de cache, headers básicos, política de SPA, plan de rollback.
- **No incluye:** CI/CD automático (GitHub Actions queda fuera del sprint inicial; deploy manual desde la máquina del desarrollador). CSP estricta. Dominio custom (se documenta como follow-up, no requerido para soft-launch).

## 3. Decisiones clave

| Decisión | Valor | Justificación |
|---|---|---|
| Carpeta pública | `dist/parqueadero-web/browser` | Output del builder `@angular-devkit/build-angular:application` cuando no hay SSR. |
| Configuración de build | `production` | `angular.json` aplica fileReplacement a `environment.prod.ts`, habilita el SW vía `ngsw-config.json` y output hashing. |
| SPA rewrite | `**` → `/index.html` | Angular Router maneja el ruteo client-side. |
| Cache de `index.html` y archivos del SW | `no-cache, no-store, must-revalidate` | `index.html`, `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `manifest.webmanifest` NO tienen hash. El SW detecta updates leyendo `ngsw.json`, debe llegar fresco. |
| Cache de assets con hash | `public, max-age=31536000, immutable` | Bundles JS/CSS y fuentes con hash en el nombre — seguros para cache eterno. |
| Headers de seguridad base | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` | Mínimo razonable. CSP queda para iteración posterior tras inventariar orígenes Supabase/PowerSync. |
| `cleanUrls` / `trailingSlash` | no configurar | El SPA rewrite cubre todas las rutas; meterse con cleanUrls puede romper PWA. |
| Proyecto Firebase | `<TO_CONFIRM>` | El usuario decide el ID al hacer `firebase use --add`. Sugerido: `parqueadero-web`. |
| Ámbito del repo | `parqueadero-web/firebase.json` (no en la raíz) | Mantiene la config junto al artefacto que despliega; el comando se corre con `cwd = parqueadero-web/`. |

## 4. Estructura esperada

```
parqueadero-web/
├── firebase.json          ← config de hosting (este spec define su contenido)
├── .firebaserc            ← project alias → projectId real
├── angular.json
├── dist/parqueadero-web/
│   └── browser/           ← lo que se sube
│       ├── index.html
│       ├── ngsw.json
│       ├── ngsw-worker.js
│       ├── manifest.webmanifest
│       ├── *.js, *.css (con hash)
│       └── assets/
```

## 5. Contenido de `firebase.json`

```json
{
  "hosting": {
    "public": "dist/parqueadero-web/browser",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/index.html",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      },
      {
        "source": "/ngsw.json",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      },
      {
        "source": "/ngsw-worker.js",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      },
      {
        "source": "/safety-worker.js",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      },
      {
        "source": "/manifest.webmanifest",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      },
      {
        "source": "**/*.@(js|css|woff|woff2|ttf|otf|eot|svg|png|jpg|jpeg|webp|gif|ico)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "**",
        "headers": [
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
        ]
      }
    ]
  }
}
```

## 6. Contenido de `.firebaserc`

```json
{
  "projects": {
    "default": "<TO_CONFIRM>"
  }
}
```

El placeholder `<TO_CONFIRM>` se reemplaza por el ID real cuando el usuario confirme/cree el proyecto Firebase.

## 7. Comandos operacionales

Todos se corren desde `parqueadero-web/`.

| Acción | Comando |
|---|---|
| Login (una vez por máquina) | `firebase login` |
| Listar proyectos | `firebase projects:list` |
| Crear proyecto | `firebase projects:create <id>` |
| Asociar al alias `default` | `firebase use --add` |
| Build productivo | `ng build --configuration=production` |
| Vista previa local (channel temp) | `firebase hosting:channel:deploy preview` |
| Deploy productivo | `firebase deploy --only hosting` |
| Listar releases | `firebase hosting:releases:list` |
| Rollback | `firebase hosting:rollback` |

## 8. Plan de rollback

1. `firebase hosting:releases:list` → identificar release previa estable.
2. `firebase hosting:rollback` → revierte al release anterior (instantáneo, no requiere rebuild).
3. Si el rollback de hosting no basta (ej. la regresión es de datos en Supabase), aplicar plan de rollback documentado en PLAN.md §Fase 10.

## 9. Variables sensibles

- `environment.prod.ts` contiene `supabaseUrl` y `supabaseAnonKey`. La anon key es **pública por diseño** (filtrada al cliente en cualquier app Supabase), pero la seguridad real depende de las **RLS policies** (cubiertas en `parqueadero-backend/specs/rls-policies.spec.md`).
- NO incluir service_role keys ni secretos de Edge Functions en el bundle.

## 10. Checklist post-deploy

- [ ] La URL `https://<project>.web.app` carga el login.
- [ ] Login funciona con credenciales reales (Supabase prod).
- [ ] `Application → Service Workers` en DevTools muestra `ngsw-worker.js` activado.
- [ ] `Application → Manifest` muestra el manifest cargado, instalable como PWA.
- [ ] Refrescar la página tras un nuevo deploy actualiza el SW (ver `ngsw.json` con `hash` nuevo).
- [ ] `Auth → URL Configuration → Site URL` del proyecto Supabase prod apunta al dominio Firebase.

## 11. Follow-ups (no bloquean Fase 10)

- CI/CD: GitHub Action `firebase-hosting-merge` para deploy automático en `main`.
- Dominio custom.
- CSP estricta (`script-src`, `connect-src` con orígenes Supabase + PowerSync).
- Channel `staging` cuando exista proyecto Supabase staging.
