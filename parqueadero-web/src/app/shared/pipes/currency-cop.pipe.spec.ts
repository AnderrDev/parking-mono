import { CurrencyCopPipe } from './currency-cop.pipe';

describe('CurrencyCopPipe', () => {
  let pipe: CurrencyCopPipe;

  beforeEach(() => { pipe = new CurrencyCopPipe(); });

  it('formats zero cents as $ 0', () => {
    expect(pipe.transform(0)).toBe('$ 0');
  });

  it('formats 500000 cents (5.000 pesos)', () => {
    const result = pipe.transform(500_000);
    expect(result).toContain('5');
    expect(result).toContain('$');
  });

  it('returns em-dash for null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('formats 10000 cents (100 pesos)', () => {
    const result = pipe.transform(10_000);
    expect(result).toContain('100');
  });
});
