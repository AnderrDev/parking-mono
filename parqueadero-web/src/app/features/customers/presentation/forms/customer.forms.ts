import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class CustomerForms {
  constructor(private readonly fb: FormBuilder) {}

  createCustomerForm(defaults?: Partial<{
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
  }>): FormGroup {
    return this.fb.group({
      docType: [defaults?.docType ?? 'cedula', Validators.required],
      docNumber: [defaults?.docNumber ?? '', [Validators.required, Validators.minLength(5), Validators.maxLength(20), Validators.pattern(/^[0-9X]+$/)]],
      dv: [defaults?.dv ?? null],
      name: [defaults?.name ?? '', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
      email: [defaults?.email ?? null, Validators.email],
      phone: [defaults?.phone ?? null],
      address: [defaults?.address ?? null, Validators.maxLength(200)],
      municipio: [defaults?.municipio ?? null, Validators.maxLength(100)],
      departamento: [defaults?.departamento ?? null, Validators.maxLength(100)],
      responsabilidadesFiscales: [defaults?.responsabilidadesFiscales ?? 'R-99-PN'],
    });
  }
}
