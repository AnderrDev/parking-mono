# Spec: Login — Toggle visibilidad de contraseña

## Identificador
`login-password-toggle`

## Contexto
El campo de contraseña en la página de login no permite al usuario ver lo que está digitando. Esto es una fuente de fricción frecuente, especialmente para usuarios nuevos o que usan contraseñas largas. El toggle es una mejora de usabilidad estándar (WCAG 2.5.3, Material Design, Apple HIG).

## Objetivo
Permitir al usuario alternar entre ver y ocultar su contraseña en el formulario de login, sin afectar el comportamiento del formulario reactivo ni la validación.

## Comportamiento esperado

### Estado inicial
- El campo de contraseña muestra `type="password"` (texto oculto, puntos)
- Hay un botón de tipo `button` (no `submit`) al lado derecho del input con ícono de "ojo cerrado"
- El botón tiene `aria-label="Mostrar contraseña"` y `aria-pressed="false"`

### Al hacer clic en el toggle
- El `type` del input cambia a `text` — la contraseña se vuelve visible
- El ícono cambia a "ojo abierto" (ojo-off → ojo)
- El `aria-label` cambia a `"Ocultar contraseña"` y `aria-pressed="true"`
- El foco permanece en el input (no se mueve al botón)

### Al hacer clic de nuevo
- El `type` vuelve a `password`
- El ícono vuelve a "ojo cerrado"
- `aria-label` vuelve a `"Mostrar contraseña"` y `aria-pressed="false"`

### Validación del formulario
- El toggle no afecta el `formControlName="password"` ni su estado de validación
- Cambiar el tipo del input NO resetea el valor del campo
- Si el campo tiene error (`field__input--error`), el error persiste independientemente del estado del toggle

## Contrato de componente

El toggle vive en `login.page.ts` (inline template) — NO es un componente separado.

### Señal nueva en `LoginPageComponent`
```typescript
protected showPassword = signal(false);
protected togglePassword(): void { this.showPassword.update(v => !v); }
```

### Template change (campo contraseña)
```html
<div class="field__input-wrap">
  <input
    class="field__input"
    [class.field__input--error]="showFieldError('password')"
    [type]="showPassword() ? 'text' : 'password'"
    id="password"
    formControlName="password"
    autocomplete="current-password"
    [attr.aria-describedby]="showFieldError('password') ? 'password-error' : null"
  />
  <button
    type="button"
    class="field__toggle"
    (click)="togglePassword()"
    [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
    [attr.aria-pressed]="showPassword()"
  >
    <!-- SVG ojo / ojo-tachado según showPassword() -->
  </button>
</div>
```

### SCSS nuevo (`.field__input-wrap`, `.field__toggle`)
```scss
.field__input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field__toggle {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  transition: color var(--motion-fast) var(--ease-out);

  &:hover { color: var(--color-text); }
  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

// El input con toggle necesita padding derecho para no solaparse con el botón
.field__input-wrap .field__input {
  padding-right: calc(var(--space-3) + 28px + var(--space-2));
}
```

## Reglas de negocio
- El toggle es **solo presentacional** — no modifica el valor del formulario, no interactúa con usecases ni repositorios
- El estado `showPassword` es **local** al componente de login, no persiste entre sesiones
- Al hacer submit del formulario, el estado del toggle no afecta el valor enviado

## Casos de error / edge cases
- Si el campo está deshabilitado (mientras carga), el botón toggle también se deshabilita con `[disabled]="isLoading()"`
- El botón no debe ser accesible via Tab cuando el formulario está deshabilitado

## Archivos afectados
- `parqueadero-web/src/app/features/auth/presentation/pages/login.page.ts` — nuevo signal `showPassword`, método `togglePassword()`
- Template inline en el mismo archivo (o `login.page.html` si se separa)
- `parqueadero-web/src/app/features/auth/presentation/pages/login.page.scss` — nuevas clases `.field__input-wrap` y `.field__toggle`

## No incluido en esta spec
- Persistencia del toggle entre campos (el campo de email no tiene toggle)
- Toggle en página de cambio de contraseña (es un feature separado)
