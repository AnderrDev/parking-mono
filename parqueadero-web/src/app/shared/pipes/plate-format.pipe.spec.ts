import { PlateFormatPipe } from './plate-format.pipe';

describe('PlateFormatPipe', () => {
  let pipe: PlateFormatPipe;

  beforeEach(() => { pipe = new PlateFormatPipe(); });

  it('formats car plate', () => {
    expect(pipe.transform('ABC123')).toBe('ABC-123');
  });

  it('formats moto plate', () => {
    expect(pipe.transform('ABC12D')).toBe('ABC-12D');
  });

  it('returns em-dash for null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(pipe.transform('')).toBe('—');
  });

  it('handles lowercase input by normalizing', () => {
    const result = pipe.transform('abc123');
    expect(result).toBe('ABC-123');
  });
});
