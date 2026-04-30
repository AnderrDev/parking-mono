import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import { CustomerForms } from '../forms/customer.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface CustomerDialogData {
  customer: CustomerEntity | null;
}

export interface CustomerFormValue {
  docType: string;
  docNumber: string;
  dv: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  municipio: string | null;
  departamento: string | null;
  responsabilidadesFiscales: string;
}

const DOC_TYPES = [
  { value: 'cedula', label: 'Cédula de ciudadanía' },
  { value: 'nit', label: 'NIT' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

@Component({
  selector: 'app-customer-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title">
      <header class="dialog__header">
        <h2 class="dialog__title" id="customer-dialog-title">
          {{ isEdit ? 'Editar cliente' : 'Nuevo cliente' }}
        </h2>
      </header>

      <form class="dialog__body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field-row">
          <div class="field">
            <label class="field__label" for="c-doctype">Tipo de documento</label>
            <select id="c-doctype" class="field__select" formControlName="docType">
              @for (dt of docTypes; track dt.value) {
                <option [value]="dt.value">{{ dt.label }}</option>
              }
            </select>
            @if (isEdit) {
              <span class="field__hint">El documento no se puede cambiar</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="c-docnum">Número de documento</label>
            <input id="c-docnum" class="field__input" [class.field__input--error]="err('docNumber')"
              type="text" formControlName="docNumber" placeholder="1234567890"
              [attr.aria-describedby]="err('docNumber') ? 'c-docnum-err' : null" />
            @if (err('docNumber')) {
              <span id="c-docnum-err" class="field__error" role="alert">{{ errMsg('docNumber') }}</span>
            }
          </div>
        </div>

        @if (isNit()) {
          <div class="field" style="max-width: 120px">
            <label class="field__label" for="c-dv">Dígito verificación</label>
            <input id="c-dv" class="field__input" [class.field__input--error]="err('dv')"
              type="number" formControlName="dv" min="0" max="9" placeholder="0"
              [attr.aria-describedby]="err('dv') ? 'c-dv-err' : null" />
            @if (err('dv')) {
              <span id="c-dv-err" class="field__error" role="alert">{{ errMsg('dv') }}</span>
            }
          </div>
        }

        <div class="field">
          <label class="field__label" for="c-name">Nombre completo / Razón social</label>
          <input id="c-name" class="field__input" [class.field__input--error]="err('name')"
            type="text" formControlName="name" placeholder="Juan García"
            [attr.aria-describedby]="err('name') ? 'c-name-err' : null" />
          @if (err('name')) {
            <span id="c-name-err" class="field__error" role="alert">{{ errMsg('name') }}</span>
          }
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="c-email">Email</label>
            <input id="c-email" class="field__input" [class.field__input--error]="err('email')"
              type="email" formControlName="email" placeholder="correo@ejemplo.com"
              [attr.aria-describedby]="err('email') ? 'c-email-err' : null" />
            @if (err('email')) {
              <span id="c-email-err" class="field__error" role="alert">{{ errMsg('email') }}</span>
            }
          </div>
          <div class="field">
            <label class="field__label" for="c-phone">Teléfono</label>
            <input id="c-phone" class="field__input"
              type="tel" formControlName="phone" placeholder="3001234567" />
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="c-address">Dirección</label>
          <input id="c-address" class="field__input"
            type="text" formControlName="address" placeholder="Cra 1 # 2-3" />
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="c-muni">Municipio</label>
            <input id="c-muni" class="field__input"
              type="text" formControlName="municipio" placeholder="Bogotá" />
          </div>
          <div class="field">
            <label class="field__label" for="c-depto">Departamento</label>
            <input id="c-depto" class="field__input"
              type="text" formControlName="departamento" placeholder="Cundinamarca" />
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="c-rf">Responsabilidades fiscales (DIAN)</label>
          <input id="c-rf" class="field__input"
            type="text" formControlName="responsabilidadesFiscales" placeholder="R-99-PN" />
          <span class="field__hint">Códigos separados por comas. Default: R-99-PN</span>
        </div>

        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" (click)="cancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">
            {{ isEdit ? 'Guardar cambios' : 'Crear cliente' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog { background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-6); width: min(580px, 95vw); box-shadow: var(--shadow-3); display: flex; flex-direction: column; gap: var(--space-5); }
    .dialog__header { border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-4); }
    .dialog__title { font-size: var(--text-lg); font-weight: var(--font-weight-semibold); margin: 0; }
    .dialog__body { display: flex; flex-direction: column; gap: var(--space-4); }
    .dialog__actions { display: flex; gap: var(--space-3); justify-content: flex-end; padding-top: var(--space-2); border-top: 1px solid var(--color-border); }
    .field { display: flex; flex-direction: column; gap: var(--space-1); }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .field__label { font-size: var(--text-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
    .field__hint { font-size: var(--text-xs); color: var(--color-text-muted); }
    .field__input, .field__select { padding: var(--space-2) var(--space-3); font-size: var(--text-base); font-family: var(--font-sans); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); min-height: var(--touch-target-min); box-sizing: border-box; width: 100%; &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent); } }
    .field__input--error { border-color: var(--color-danger); }
    .field__error { font-size: var(--text-xs); color: var(--color-danger); }
    .btn { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-base); min-height: var(--touch-target-secondary); cursor: pointer; }
    .btn--ghost { background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    @media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }
  `],
})
export class CustomerEditDialogComponent implements OnInit {
  protected readonly data = inject<CustomerDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<CustomerFormValue | null>);
  private readonly customerForms = inject(CustomerForms);

  protected form!: FormGroup;
  protected readonly docTypes = DOC_TYPES;
  protected get isEdit(): boolean { return this.data.customer !== null; }
  protected readonly isNit = signal(false);

  ngOnInit(): void {
    const c = this.data.customer;
    this.form = this.customerForms.createCustomerForm(c ? {
      docType: c.docType,
      docNumber: c.docNumber,
      dv: c.dv,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      municipio: c.municipio,
      departamento: c.departamento,
      responsabilidadesFiscales: c.responsabilidadesFiscales.join(','),
    } : undefined);

    if (this.isEdit) {
      this.form.get('docType')?.disable();
      this.form.get('docNumber')?.disable();
    }

    this.isNit.set(this.form.get('docType')?.value === 'nit');
    this.form.get('docType')?.valueChanges.subscribe(v => this.isNit.set(v === 'nit'));
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.getRawValue() as CustomerFormValue);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
