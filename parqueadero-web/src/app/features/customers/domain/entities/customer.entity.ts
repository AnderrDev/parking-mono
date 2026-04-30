export type DocType = 'cedula' | 'nit' | 'pasaporte';

export class CustomerEntity {
  constructor(
    public readonly id: string,
    public readonly docType: DocType,
    public readonly docNumber: string,
    public readonly dv: number | null,
    public readonly name: string,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly address: string | null,
    public readonly municipio: string | null,
    public readonly departamento: string | null,
    public readonly responsabilidadesFiscales: string[],
    public readonly isDeleted: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
