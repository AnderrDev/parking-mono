# Matriz QA pre-producción — Historias de Usuario

**Última actualización:** 2026-05-25
**Estado:** Borrador para validación con usuario antes de testing.
**Propósito:** Inventario completo de funcionalidades del sistema para servir como checklist de QA antes de deploy productivo (Fase 10).

Convención: cada HU tiene **ID**, **rol** requerido, **resultado esperado** y **modo de verificación** (UI / BD / E2E / manual).

---

## 1. Autenticación y sesión

| ID | HU | Rol | Verificación |
|---|---|---|---|
| AUTH-01 | Login con email/password muestra dashboard según rol | Todos | UI: redirige a `/parking`; navbar muestra rol correcto |
| AUTH-02 | Logout cierra sesión y redirige a `/auth/login` | Todos | UI: pierde acceso a rutas protegidas |
| AUTH-03 | Cambiar password desde `/account/password` | Todos | BD: encrypted_password rotado |
| AUTH-04 | Refresh (F5) mantiene sesión | Todos | UI: no expulsa al login |
| AUTH-05 | Login con credenciales malas muestra error inline | Todos | UI: mensaje "Email o contraseña incorrectos" |
| AUTH-06 | Usuario `is_active=false` no puede ingresar | Todos | UI: error de login |

## 2. Roles y permisos (guards)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| RBAC-01 | Operador no ve sidebar de Administración | operador | UI: solo 4 items (Parqueadero, Caja, Mensualidades, Vehículos) |
| RBAC-02 | Contador ve sidebar admin (read-only) | contador | UI: ve Dashboard, Reportes, Historiales, NO ve Tarifas/Settings/Users |
| RBAC-03 | Admin ve sidebar completo | admin | UI: todos los items |
| RBAC-04 | Brand-tag del logo refleja el rol | Todos | UI: "Admin" / "Operador" / "Contador" |
| RBAC-05 | URL directa a ruta no permitida redirige a `/parking` | operador, contador | UI: navega a /tariffs como operador → /parking |
| RBAC-06 | RLS de Supabase impide queries no autorizadas | Todos | BD: operador no puede SELECT users de otros |

## 3. Caja (apertura, operación, cierre)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| CAJA-01 | Operador abre turno con saldo inicial | operador | BD: `cashier_shifts.status='open'`, `opening_balance_cents` correcto |
| CAJA-02 | Banner de caja abierta visible en /parking | operador | UI: chip verde con hora y saldo apertura |
| CAJA-03 | Solo un turno abierto por operador a la vez | operador | BD: UNIQUE constraint `uq_shifts_open_per_user` |
| CAJA-04 | Cerrar turno con conteo final | operador | BD: `closed_at`, `closing_balance_cents`, `difference_cents` |
| CAJA-05 | Diferencia > threshold requiere justificación | operador | UI: bloqueo hasta llenar campo |
| CAJA-06 | Retiro de caja con justificación durante turno | operador | BD: `cash_withdrawals` row + auditoría |
| CAJA-07 | Sin caja abierta NO se puede registrar entrada | operador | UI: botón "Registrar entrada" disabled + banner |
| CAJA-08 | Historial de turnos cerrados accesible | admin, contador | UI: `/cashier/history` lista paginada con totales |
| CAJA-09 | Reconciliación por método de pago | admin, contador | UI: detalle de turno muestra suma efectivo/tarjeta/etc |

## 4. Tarifas (admin only)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| TAR-01 | Listar tarifas vigentes | admin | UI: tabla con $/min, $/hora, Tope día |
| TAR-02 | Crear tarifa parking con per_minute + per_hour + plena | admin | BD: row con los 3 valores |
| TAR-03 | Crear tarifa mensualidad con precio mensual + fechas | admin | BD: row con `unit='mensualidad'`, valueCents |
| TAR-04 | Editar tarifa actualiza valores | admin | BD: cambios persistidos |
| TAR-05 | Desactivar tarifa (soft delete) | admin | BD: `is_active=false`, sesiones viejas siguen viendo histórico |
| TAR-06 | C5: per_hour ≤ 60 × per_minute | admin | UI: banner rojo si se viola |
| TAR-07 | C6: plena ≤ 24 × per_hour | admin | UI: banner rojo si se viola |
| TAR-08 | Preview de cobro en vivo en dialog | admin | UI: tabla 30min/1h/1h30/2h/5h/24h se actualiza |
| TAR-09 | Una tarifa parking activa por vehicle_type (UNIQUE C7) | admin | BD: constraint rechaza duplicados |
| TAR-10 | Tarifa mensualidad y parking coexisten para mismo tipo | admin | BD: ambas activas al mismo tiempo |

## 5. Operación parking (entrada / salida)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| PARK-01 | Validar formato placa colombiano (ABC123 o ABC12D) | operador, admin | UI: error inline si formato inválido |
| PARK-02 | Una placa = una sesión activa simultánea | operador, admin | BD: constraint `uq_sessions_active`; UI muestra error |
| PARK-03 | Registrar entrada captura snapshot de tarifa | operador, admin | BD: `tariff_snapshot_*` campos poblados al INSERT |
| PARK-04 | Si placa tiene mensualidad activa, sesión es `monthly` | operador, admin | BD: `monthly_plan_id` set; cobro = $0 |
| PARK-05 | Ticket de entrada se imprime (popup térmico 80mm) | operador, admin | UI: ventana popup con datos del parqueadero + placa + QR |
| PARK-06 | Vehículos activos visibles en dashboard operador | operador, admin | UI: lista con placa + duración live |
| PARK-07 | Cobro aditivo: hours × per_hour + remainder × per_minute | operador, admin | UI: diálogo de salida muestra desglose |
| PARK-08 | Cap por plena cuando subtotal supera el tope | operador, admin | UI: subtotal tachado + plena destacada |
| PARK-09 | Comprobante de salida se imprime tras confirmar | operador, admin | UI: popup con desglose y total |
| PARK-10 | Cobro persiste con snapshot inmutable | operador, admin | BD: tras edit de tarifa, /payments sigue mostrando snapshot original |

## 6. Métodos de pago

| ID | HU | Rol | Verificación |
|---|---|---|---|
| PAGO-01 | Solo aparecen los métodos habilitados en /settings | operador | UI: dropdown filtrado por `operational_config.enabled_payment_methods` |
| PAGO-02 | Sesión mensual → solo "Plan mensual" en dropdown | operador, admin | UI: única opción |
| PAGO-03 | Pago en efectivo solicita monto recibido | operador | UI: input visible con mínimo = total |
| PAGO-04 | Cambio se calcula en vivo | operador | UI: chip verde/rojo según diferencia |
| PAGO-05 | Métodos especiales (cortesia/error) ya NO aparecen | operador | UI: 2026-05-24 — removidos del dropdown |

## 7. Mensualidades

| ID | HU | Rol | Verificación |
|---|---|---|---|
| MENS-01 | Listar mensualidades activas | admin, operador, contador | UI: lista con cliente, placa, fechas, estado |
| MENS-02 | Crear mensualidad con cobro asociado al turno | admin, operador | BD: monthly_plan + payment registrados en una RPC atómica |
| MENS-03 | Vincular o crear cliente desde el dialog | admin, operador | UI: search + create inline |
| MENS-04 | Cancelar mensualidad con justificación | admin | BD: status='cancelled', audit_log |
| MENS-05 | Renovar mensualidad próxima a vencer | admin, operador | BD: nuevo registro con fechas extendidas |
| MENS-06 | Sesiones de placa con plan activo cobran $0 | operador, admin | UI: dialog dice "Sin cobro — plan mensual activo" |
| MENS-07 | Solapamiento de planes rechazado | admin | UI: error "Ya existe plan activo en ese rango" |

## 8. Vehículos

| ID | HU | Rol | Verificación |
|---|---|---|---|
| VEH-01 | Listar vehículos registrados con filtros | admin, operador | UI: tabla paginada |
| VEH-02 | Buscar vehículo por placa parcial | operador | UI: autocomplete en /parking |
| VEH-03 | Ver historial de sesiones de un vehículo | admin, operador | UI: navegar a histórico filtrado |
| VEH-04 | Editar datos de vehículo (cliente vinculado) | admin | BD: update row |
| VEH-05 | Desactivar vehículo (soft delete) | admin | BD: `_deleted=true`, no aparece en búsqueda |

## 9. Historial de cobros (`/payments`)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| COB-01 | Lista filtrable por fecha, placa, método | admin, contador | UI: filtros aplicados → resultado correcto |
| COB-02 | Total filtrado visible arriba | admin, contador | UI: card "TOTAL FILTRADO" |
| COB-03 | Click en fila expande detalle (Sesión/Atención/Cobro/Tarifa) | admin, contador | UI: row-detail con 4 secciones |
| COB-04 | Reprint genera popup térmico con comprobante original | admin, contador | UI: ventana popup |
| COB-05 | Snapshot de tarifa visible en detalle | admin, contador | UI: muestra valores congelados al cobro |
| COB-06 | Fallback por vehicle_type para sesiones legacy | admin, contador | UI: rows con tariff_snapshot=NULL muestran tarifa activa actual |

## 10. Historial de sesiones (`/parking/history`)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| SES-01 | Lista con filtros (fecha/placa/tipo/estado) | admin, contador | UI: tabla paginada |
| SES-02 | Duración live para activas | admin, contador | UI: actualiza cada minuto |
| SES-03 | Cobro proyectado para activas (badge ~) | admin, contador | UI: cifra italic + chip naranja |
| SES-04 | Cobro real persistido para completadas | admin, contador | UI: amount_due_cents |
| SES-05 | Anular sesión (admin) | admin | BD: status='cancelled', justificación obligatoria |

## 11. Reportes (`/reports`)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| REP-01 | Ingresos por período (día/semana/mes) | admin, contador | UI: tabla con totales |
| REP-02 | Sesiones por tipo de vehículo | admin, contador | UI: gráfico/tabla |
| REP-03 | Performance por operador | admin, contador | UI: ranking con counts |
| REP-04 | Filtro por rango de fechas | admin, contador | UI: respeta max_report_range_days del setting |
| REP-05 | Export CSV vía edge function | admin | UI: descarga archivo o URL firmada |

## 12. Dashboard (`/dashboard`)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| DASH-01 | KPIs del día visibles (ingresos, vehículos atendidos) | admin, contador | UI: cards con métricas |
| DASH-02 | Link a reportes detallados | admin, contador | UI: navegación funcional |

## 13. Configuración (`/settings`, admin)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| CFG-01 | Datos del parqueadero (nombre, NIT, dirección) | admin | BD: `app_settings.parking_info` |
| CFG-02 | Tipo (público/privado), resolución, hora cierre | admin | BD: campos en parking_info |
| CFG-03 | Tope efectivo en caja | admin | BD: `operational_config.cash_cap_cents` |
| CFG-04 | Días de gracia mensualidad | admin | BD: `operational_config.monthly_grace_days` |
| CFG-05 | Email del admin para alertas | admin | BD: `operational_config.admin_email` |
| CFG-06 | Métodos de pago habilitados (checkboxes) | admin | BD: `operational_config.enabled_payment_methods` array |
| CFG-07 | IVA: porcentaje y régimen | admin | BD: `app_settings.tax_config` |
| CFG-08 | Cambios reflejados inmediatamente en UI operador | admin | UI: tarifas/métodos actualizados |

## 14. Usuarios (`/users`, admin)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| USR-01 | Listar usuarios activos del sistema | admin | UI: tabla |
| USR-02 | Toggle "Mostrar inactivos" | admin | UI: filtra is_active |
| USR-03 | Crear usuario con rol (operador/admin/contador) | admin | BD: rows en `auth.users` + `public.users` ← bloqueada hoy por Edge Function `manage-users` no deployada |
| USR-04 | Cambiar rol inline en la tabla | admin | BD: update `public.users.role` |
| USR-05 | Desactivar usuario | admin | BD: `is_active=false` |
| USR-06 | Admin no puede desactivarse a sí mismo | admin | UI: botón disabled para auto-row |

## 15. Auditoría (`/audit`)

| ID | HU | Rol | Verificación |
|---|---|---|---|
| AUD-01 | Log de acciones sensibles (INSERT/UPDATE/DELETE) | admin, contador | BD: `audit_log` append-only |
| AUD-02 | Filtros por entidad, acción, fecha, usuario | admin, contador | UI: filtros activos |
| AUD-03 | Diff before/after en JSON | admin, contador | UI: detalle expandible |

## 16. Impresión POS

| ID | HU | Rol | Verificación |
|---|---|---|---|
| POS-01 | Ticket de entrada (80mm térmico) con QR | operador, admin | UI: popup con formato correcto |
| POS-02 | Comprobante de salida con desglose | operador, admin | UI: popup con totales |
| POS-03 | Datos legales del parqueadero (nombre, NIT, dirección) | operador, admin | UI: header del ticket |
| POS-04 | Sin fondos negros (texto plano + bordes) | operador, admin | UI: ticket-type y total-line con borders |
| POS-05 | Tarifa snapshot en ticket | operador, admin | UI: muestra valores aplicados al cobro |

## 17. Infraestructura

| ID | HU | Rol | Verificación |
|---|---|---|---|
| INF-01 | App online-only bloquea operación sin red | Todos | Manual: cortar red, intentar registrar entrada y verificar error sin persistencia local |
| INF-02 | Realtime entre tabs (Supabase Realtime) | Todos | Manual: abrir 2 tabs, registrar en una, ver actualización en la otra |
| INF-03 | Service worker anterior queda desregistrado | Todos | DevTools: Application → Service Workers sin worker activo tras recargar |
| INF-04 | Stale-write protection (P0409) | Todos | Manual: editar misma tarifa desde 2 tabs |
| INF-05 | Loading skeletons mientras carga datos | Todos | UI: estados visibles |
| INF-06 | Toast errors con mensajes accionables | Todos | UI: notificaciones |

## Total

**173 HUs** cubriendo 17 áreas funcionales.

---

## Notas

- Marcamos con ✅/❌/⚠️ tras testing.
- Las **bloqueadas** (HU-USR-03 hoy) van con motivo y fix sugerido.
- Bugs encontrados se documentan en sesión correspondiente.
- E2E críticas (login operador → entrada → salida → cierre caja) son requisito DoD para Fase 10.
