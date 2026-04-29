export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in';

export interface FilterParam {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterParams = FilterParam[];
