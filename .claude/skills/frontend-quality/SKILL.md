---
name: frontend-quality
description: Frontend quality reviewer — accessibility (WCAG 2.2 AA), Core Web Vitals, semantic HTML, responsive design, PWA correctness, TypeScript strictness, bundle hygiene. Use whenever writing or reviewing UI code (Angular components, templates, SCSS, service worker config) and before shipping any user-facing change. Triggers on prompts like "revisa la accesibilidad", "lighthouse", "performance", "responsive", "pwa", "service worker", a11y, after edits to .component.html/.scss.
---

# frontend-quality — A11y · Performance · PWA · TS Strict

This skill is the **quality gate** for anything user-facing in `parqueadero-web/`. Run the relevant checklists before declaring a UI change done.

## A11y (WCAG 2.2 AA — non-negotiable)

- **Semantic HTML first.** `<button>` for actions, `<a href>` for navigation, `<form>` + `<label>`. Never `<div onclick>`.
- **Every input has a label.** Either `<label for="x">` + `<input id="x">` or `aria-label`. Placeholders are not labels.
- **Focus visible always.** Don't `outline: none` without a replacement (`:focus-visible` ring).
- **Keyboard reachable.** Every interactive element: `Tab`, `Enter`/`Space` activates, `Esc` closes dialogs. Focus trap in modals; restore focus on close.
- **Color contrast ≥ 4.5:1** for body text, ≥ 3:1 for large text (≥18.66px or bold ≥14px) and UI components/borders.
- **Don't rely on color alone.** Errors get an icon + text, not only red.
- **Live regions for async feedback.** Toast/alert containers use `role="status"` (polite) or `role="alert"` (assertive).
- **Form errors associated.** `aria-invalid="true"` + `aria-describedby="err-id"` on input; the message has `id="err-id"`.
- **Touch targets ≥ 44×44px** (operario usa tablets; el dedo no es un mouse).
- **Language declared.** `<html lang="es-CO">`. Spanish content gets `lang="es"`, mixed content gets per-element lang.
- **Skip link** to main content on every page.
- **Test with keyboard only.** Then test with VoiceOver (Mac: ⌘F5) on the operator dashboard.

## Performance (Core Web Vitals targets)

| Metric | Target |
|---|---|
| **LCP** (Largest Contentful Paint) | < 2.5s |
| **INP** (Interaction to Next Paint) | < 200ms |
| **CLS** (Cumulative Layout Shift) | < 0.1 |
| Initial JS budget | < 200KB gzipped |
| Initial route TTI on 3G | < 5s |

How to hit them:
- **`OnPush` + signals.** Default in this project. Don't break it with `markForCheck()` hacks.
- **`@defer` blocks** for below-the-fold and rare-path UI (`@defer (on viewport)`, `@defer (on interaction)`).
- **Lazy routes**: every feature is `loadChildren`. Verify route bundles in `dist/stats.json` (run `ng build --stats-json`).
- **Images**: `NgOptimizedImage` with `priority` on LCP image; explicit `width`/`height` to prevent CLS; AVIF/WebP.
- **Fonts**: self-host, `font-display: swap`, preload only the LCP font weight.
- **No mega-libs**: prefer native `Intl` over moment; `fetch` over axios; tree-shakable RxJS imports.
- **Avoid layout shift**: reserve space for skeletons, toasts, async images, and the offline banner.

## Responsive Design

- **Mobile-first SCSS.** Base styles for ≤ 480px, then `@media (min-width: 768px)`, `(min-width: 1280px)`.
- **`clamp()` for fluid type**: `font-size: clamp(0.95rem, 0.85rem + 0.5vw, 1.1rem)`.
- **CSS Grid for layout, Flexbox for components.**
- **No horizontal scroll on any breakpoint.** Test at 320px width.
- **Touch-friendly on tablet (operario).** Buttons in operator-facing pages: min 56×56 with 12px gap.
- **Container queries** (`@container`) for components that change layout based on parent (data-table responsive collapse).

## PWA / Service Worker

- `ngsw-config.json` declares: `assetGroups` (app shell, prefetch) and `dataGroups` (Supabase calls, freshness strategy).
- **Don't cache mutations.** PowerSync handles offline writes; the SW must not also try to.
- **Updateable**: handle `SwUpdate.versionUpdates$` → show "Hay una nueva versión, recargar" toast.
- **Install prompt**: deferred prompt pattern (`beforeinstallprompt`), surfaced on Settings, not popup-spammed.
- **Offline indicator** is wired to `NetworkInfoService.isOnline$`. Operator pages show the banner when `false`.

## TypeScript Strictness (enforce in tsconfig)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- **Never `any`.** Use `unknown` and narrow with `instanceof` / type guards.
- **Discriminated unions** for state machines (`type EntryState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error', failure: Failure } | ...`).
- **Branded types** for IDs: `type SessionId = string & { __brand: 'SessionId' }` to prevent mixing.
- **Exhaustive switches** with `assertNever`.

## SCSS Hygiene

- **One stylesheet per component**, scoped via Angular's view encapsulation.
- **CSS variables** for tokens: `--color-primary`, `--space-3`, `--radius-md`. No hardcoded hex outside the token file.
- **No `::ng-deep`.** If you need to style a child, expose a CSS variable.
- **BEM-ish naming** inside components: `.entry-form__field`, `.entry-form__field--invalid`.

## Self-check (run after every UI change)

- [ ] Tabbed through every interactive element with keyboard.
- [ ] No console errors / warnings.
- [ ] Lighthouse a11y ≥ 95, perf ≥ 90 on a representative page.
- [ ] Tested at 320px, 768px, 1280px.
- [ ] Touch target audit on operator pages.
- [ ] Bundle didn't grow unexpectedly (`ng build --stats-json` + diff).
- [ ] Offline indicator works with DevTools "Offline" toggle.
- [ ] No `any`, no `// @ts-ignore`.

## What NOT to do

- ❌ `<div role="button" tabindex="0" (click)=...>` instead of `<button>`.
- ❌ Hardcoded `color: #ff0000` outside token file.
- ❌ Subscribing in `ngOnInit` without `takeUntilDestroyed()` or `async` pipe.
- ❌ Loading 1MB hero image without `NgOptimizedImage`.
- ❌ `setTimeout` to "fix" change detection.
- ❌ Disabling lint rules instead of fixing the code.
