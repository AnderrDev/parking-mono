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
  templateUrl: './customer-edit-dialog.component.html',
  styleUrl: './customer-edit-dialog.component.scss',
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
