import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';

export interface CustomerModel {
  id: string;
  doc_type: string;
  doc_number: string;
  dv: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  municipio: string | null;
  departamento: string | null;
  responsabilidades_fiscales: string[] | null;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export class CustomerMapper {
  static toEntity(m: CustomerModel): CustomerEntity {
    return new CustomerEntity(
      m.id,
      m.doc_type as DocType,
      m.doc_number,
      m.dv,
      m.name,
      m.email,
      m.phone,
      m.address,
      m.municipio,
      m.departamento,
      m.responsabilidades_fiscales ?? ['R-99-PN'],
      m._deleted,
      new Date(m.created_at),
      new Date(m.updated_at),
    );
  }
}
