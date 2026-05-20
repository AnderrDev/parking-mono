# Sesión: Deploy del frontend a Firebase Hosting

**Fecha:** 2026-05-20
**Subproyecto(s):** parqueadero-web
**Fase:** 10 (QA + Deploy productivo)
**Estado:** en curso

## Objetivos
- [ ] Crear spec `parqueadero-web/specs/infrastructure/firebase-hosting.spec.md`.
- [ ] Configurar `firebase.json` y `.firebaserc` en `parqueadero-web/` (SPA rewrite + headers cache/SW).
- [ ] Build `ng build --configuration=production` exitoso.
- [ ] (Pendiente confirmación usuario) `firebase deploy --only hosting` al proyecto productivo.

## Contexto
- Frontend: Angular 18 PWA, builder `@angular-devkit/build-angular:application`, CSR puro (no SSR/prerender), output `dist/parqueadero-web/browser/`, service worker `ngsw-config.json`.
- Backend: Supabase remoto `hhwctcjwrlbqgsrfriqn` (productivo). `environment.prod.ts` ya tiene `supabaseUrl` y `supabaseAnonKey`.
- Firebase CLI: v15.13.0 instalado, autenticado. Proyecto Firebase existente: `gym-flutter-web-224` (otro proyecto, no aplica). Hay que crear/seleccionar uno para parqueadero.
- CLAUDE.md del subproyecto §10 menciona "Vercel, Netlify o similar" — el usuario elige Firebase Hosting.

## Decisiones provisionales (a confirmar)
- Carpeta pública: `dist/parqueadero-web/browser`.
- SPA: rewrite `**` → `/index.html`.
- Cache-Control:
  - `index.html`, `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `manifest.webmanifest`: `no-cache, no-store, must-revalidate`. Razón: archivos sin hash, el SW de Angular descubre updates por `ngsw.json`.
  - Assets con hash (`*.js`, `*.css`, fuentes): `public, max-age=31536000, immutable`.
- Headers de seguridad: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. CSP queda fuera de este sprint (requiere inventariar orígenes Supabase exactos).

## Avance

(Pendiente — se llena al cerrar.)

## Bloqueos / Pendientes
- ID de proyecto Firebase a usar/crear (sugerido: `parqueadero-web`).
- Confirmación del usuario antes de ejecutar `firebase deploy`.

## Next Steps
- [ ] Aplicar cambio en `parqueadero-backend/supabase` → `Auth → URL Configuration → site_url` apuntando al dominio Firebase tras el primer deploy.
