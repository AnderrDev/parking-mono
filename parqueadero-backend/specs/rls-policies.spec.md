# Spec: Row Level Security (RLS) Policies

## Propósito
Define exactamente qué puede ver, insertar, actualizar y deletar cada rol de usuario en cada tabla. La seguridad del sistema depende de que estas políticas sean correctas.

## Roles

- `admin`: Acceso total a todo
- `operador`: Acceso limitado a operaciones de parqueadero y su caja
- `contador`: Lectura de reportes y auditoría
- `anon`: Sin acceso a nada (login requerido)

## Tabla: `users`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft delete) |
| operador | Solo su propio registro | No | Solo nombre | No |
| contador | Solo activos | No | No | No |

**Políticas específicas:**
```sql
-- Operador ve solo su propio registro
CREATE POLICY "operador_read_own" ON users
FOR SELECT USING (auth.uid() = id);

-- Admin ve todo
CREATE POLICY "admin_all" ON users
FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Contador ve usuarios activos
CREATE POLICY "contador_read_active" ON users
FOR SELECT USING (auth.jwt() ->> 'role' = 'contador' AND is_active = TRUE);
```

## Tabla: `parking_sessions`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft) |
| operador | Sus propias sesiones de hoy | Sí (entrada) | Su salida | No |
| contador | Todas (lectura) | No | No | No |

**Políticas:**
```sql
-- Operador inserta entrada
CREATE POLICY "operador_insert_entry" ON parking_sessions
FOR INSERT WITH CHECK (entry_user_id = auth.uid());

-- Operador actualiza su salida
CREATE POLICY "operador_update_own_exit" ON parking_sessions
FOR UPDATE USING (exit_user_id = auth.uid() OR exit_user_id IS NULL)
WITH CHECK (exit_user_id = auth.uid());

-- Operador ve sus sesiones del turno actual
CREATE POLICY "operador_read_own_shift" ON parking_sessions
FOR SELECT USING (
  entry_user_id = auth.uid()
  AND DATE(entry_at) = CURRENT_DATE
);

-- Contador y admin leen todo
CREATE POLICY "admin_contador_read_all" ON parking_sessions
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));
```

## Tabla: `cashier_shifts`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft) |
| operador | Su turno actual | Sí (abrir) | Cerrar el propio | No |
| contador | Todos (lectura) | No | No | No |

**Políticas:**
```sql
-- Operador abre su turno
CREATE POLICY "operador_open_shift" ON cashier_shifts
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Operador cierra su turno abierto
CREATE POLICY "operador_close_own_shift" ON cashier_shifts
FOR UPDATE USING (user_id = auth.uid() AND status = 'open')
WITH CHECK (user_id = auth.uid());

-- Operador ve su turno actual
CREATE POLICY "operador_read_own_shift" ON cashier_shifts
FOR SELECT USING (user_id = auth.uid() AND status IN ('open', 'pending_sync'));

-- Contador y admin leen todo
CREATE POLICY "admin_contador_read_shifts" ON cashier_shifts
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));
```

## Tabla: `invoices`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Edge function | Edge function | Sí (soft) |
| operador | No directo (via Edge Function) | No | No | No |
| contador | Todo (lectura) | No | No | No |

**Nota:** Las inserciones y updates de facturas NUNCA vienen directamente del cliente; siempre van vía Edge Function que valida, calcula CUFE y llama al microservicio DIAN.

```sql
-- Solo Edge Function (service_role) inserta
CREATE POLICY "edge_function_only" ON invoices
FOR INSERT WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Contador y admin leen
CREATE POLICY "contador_admin_read" ON invoices
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));
```

## Tabla: `payments`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft) |
| operador | Sus pagos del turno | Sí | No | No |
| contador | Todo (lectura) | No | No | No |

```sql
-- Operador inserta pago
CREATE POLICY "operador_insert_payment" ON payments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM cashier_shifts
    WHERE id = cashier_shift_id AND user_id = auth.uid() AND status = 'open'
  )
);

-- Operador ve pagos de su caja
CREATE POLICY "operador_read_shift_payments" ON payments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cashier_shifts cs
    WHERE cs.id = payments.cashier_shift_id AND cs.user_id = auth.uid()
  )
);

-- Contador y admin leen todo
CREATE POLICY "contador_admin_read" ON payments
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));
```

## Tabla: `customers`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft) |
| operador | Búsqueda por documento (lectura) | No | No | No |
| contador | Todo (lectura) | No | No | No |

```sql
-- Operador busca clientes
CREATE POLICY "operador_read_customers" ON customers
FOR SELECT USING (auth.jwt() ->> 'role' = 'operador');

-- Contador y admin leen todo
CREATE POLICY "admin_contador_read" ON customers
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));

-- Admin inserta y actualiza
CREATE POLICY "admin_modify" ON customers
FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

## Tabla: `tariffs`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Sí | Sí | Sí | Sí (soft) |
| operador | Sí (lectura) | No | No | No |
| contador | Sí (lectura) | No | No | No |

```sql
-- Todos leen tarifas activas
CREATE POLICY "all_read_active_tariffs" ON tariffs
FOR SELECT USING (is_active = TRUE);

-- Admin ve todas y modifica
CREATE POLICY "admin_all" ON tariffs
FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

## Tabla: `monthly_plans`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Todo | Sí | Todo | Sí (soft) |
| operador | Búsqueda por placa (lectura) | No | No | No |
| contador | Todo (lectura) | No | No | No |

```sql
-- Operador busca planes
CREATE POLICY "operador_search_plans" ON monthly_plans
FOR SELECT USING (auth.jwt() ->> 'role' = 'operador');

-- Contador y admin leen
CREATE POLICY "contador_admin_read" ON monthly_plans
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));

-- Admin modifica
CREATE POLICY "admin_modify" ON monthly_plans
FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

## Tabla: `audit_log`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | Sí | Sí | No | No |
| contador | Sí | No | No | No |
| operador | No | No | No | No |

```sql
-- Esta tabla tiene ALWAYS SET _deleted = FALSE (audit trail)
-- No soporta UPDATE ni DELETE a nivel de RLS

-- Contador y admin leen
CREATE POLICY "contador_admin_read" ON audit_log
FOR SELECT USING (auth.jwt() ->> 'role' IN ('admin', 'contador'));

-- Sistema (triggers) inserta
CREATE POLICY "system_insert" ON audit_log
FOR INSERT WITH CHECK (TRUE);
```

## Triggers para Audit Log

```sql
-- Trigger genérico para registrar cambios
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_json, after_json)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar a tablas sensibles
CREATE TRIGGER audit_parking_sessions
AFTER INSERT OR UPDATE OR DELETE ON parking_sessions
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();
```

## Consideraciones de Seguridad

1. **RLS debe estar ENABLED**: `ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;`
2. **Default DENY**: Si no hay política que permite, se rechaza
3. **Service Role**: El backend usa `service_role` (bypassa RLS) para operaciones administrativas
4. **JWT claims**: `auth.jwt() ->> 'role'` viene de Supabase Auth, no es falsificable por cliente
5. **Auditoría completa**: Todos los cambios sensibles quedan registrados

---
Status: Pendiente de Implementación
