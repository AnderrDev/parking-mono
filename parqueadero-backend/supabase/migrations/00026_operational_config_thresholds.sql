-- ──────────────────────────────────────────────────────────────────────────
-- 00026 — Mover umbrales hardcoded a operational_config.
--
-- Antes: close-shift.usecase.ts:17 `DIFF_THRESHOLD_CENTS = 500_000` y
-- get-revenue-by-period.usecase.ts:15 `MAX_RANGE_MS = 365 días` vivían en
-- código. Ahora se centralizan en app_settings.operational_config para que
-- el admin pueda ajustarlos sin redeploy.
--
-- Backward-compatible: el cliente lee con `?? defaults`, así que filas
-- viejas sin estos campos siguen funcionando.
-- ──────────────────────────────────────────────────────────────────────────

UPDATE public.app_settings
SET value = value || jsonb_build_object(
              'diff_threshold_cents', 500000,
              'max_report_range_days', 365
            ),
    updated_at = now()
WHERE key = 'operational_config'
  AND NOT (value ? 'diff_threshold_cents' AND value ? 'max_report_range_days');
