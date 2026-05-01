import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { colombianPhoneValidator } from '../../../../shared/forms/validators/colombian-phone.validator';

// Mismo patrón que CreateCustomerUseCase (DOC_RE)
const DOC_PATTERN = /^[0-9X]{5,20}$/;

export interface CustomerFormDefaults {
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

@Injectable({ providedIn: 'root' })
export class CustomerForms {
  constructor(private readonly fb: FormBuilder) {}

  createCustomerForm(defaults?: Partial<CustomerFormDefaults>): FormGroup {
    const form = this.fb.group({
      docType: [defaults?.docType ?? 'cedula', Validators.required],
      docNumber: [
        defaults?.docNumber ?? '',
        [Validators.required, Validators.pattern(DOC_PATTERN)],
      ],
      dv: [defaults?.dv ?? null, [Validators.min(0), Validators.max(9)]],
      name: [
        defaults?.name ?? '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(200)],
      ],
      email: [defaults?.email ?? null, Validators.email],
      phone: [defaults?.phone ?? null, colombianPhoneValidator()],
      address: [defaults?.address ?? null, Validators.maxLength(200)],
      municipio: [defaults?.municipio ?? null, Validators.maxLength(100)],
      departamento: [defaults?.departamento ?? null, Validators.maxLength(100)],
      responsabilidadesFiscales: [defaults?.responsabilidadesFiscales ?? 'R-99-PN'],
    });

    // dv condicional: required cuando docType === 'nit'
    const apply = (docType: string | null | undefined): void => {
      const dv = form.get('dv');
      if (!dv) return;
      if (docType === 'nit') {
        dv.setValidators([Validators.required, Validators.min(0), Validators.max(9)]);
      } else {
        dv.setValidators([Validators.min(0), Validators.max(9)]);
      }
      dv.updateValueAndValidity({ emitEvent: false });
    };

    apply(form.get('docType')?.value);
    form.get('docType')?.valueChanges.subscribe((v) => apply(v));

    return form;
  }
}
