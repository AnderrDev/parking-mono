import { formatCOP, centsToNumber, numberToCents } from './currency.utils';

describe('formatCOP', () => {
  it('formats 0 cents as $ 0', () => {
    expect(formatCOP(0)).toBe('$ 0');
  });

  it('formats 100 cents as $ 1', () => {
    expect(formatCOP(100)).toContain('1');
  });

  it('formats 500000 cents (5000 pesos)', () => {
    const result = formatCOP(500_000);
    expect(result).toContain('$');
    expect(result).toContain('5');
  });

  it('rounds to nearest peso', () => {
    expect(formatCOP(150)).toBe(formatCOP(100)); // 1.5 pesos → 2 pesos (rounds)
  });
});

describe('centsToNumber', () => {
  it('converts 100 cents to 1', () => {
    expect(centsToNumber(100)).toBe(1);
  });

  it('converts 50000 cents to 500', () => {
    expect(centsToNumber(50_000)).toBe(500);
  });
});

describe('numberToCents', () => {
  it('converts 1 peso to 100 cents', () => {
    expect(numberToCents(1)).toBe(100);
  });

  it('converts 500 pesos to 50000 cents', () => {
    expect(numberToCents(500)).toBe(50_000);
  });

  it('rounds floating point', () => {
    expect(numberToCents(1.005)).toBe(101);
  });
});
