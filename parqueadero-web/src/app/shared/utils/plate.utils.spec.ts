import { normalizePlate, isValidPlate, formatPlate } from './plate.utils';

describe('normalizePlate', () => {
  it('uppercases and removes non-alphanumeric', () => {
    expect(normalizePlate('abc-123')).toBe('ABC123');
  });

  it('strips spaces', () => {
    expect(normalizePlate('ABC 123')).toBe('ABC123');
  });

  it('limits to 6 chars', () => {
    expect(normalizePlate('ABCDEFGH')).toBe('ABCDEF');
  });
});

describe('isValidPlate', () => {
  it('accepts car plate ABC123', () => {
    expect(isValidPlate('ABC123')).toBeTrue();
  });

  it('accepts moto plate ABC12D', () => {
    expect(isValidPlate('ABC12D')).toBeTrue();
  });

  it('rejects short plate', () => {
    expect(isValidPlate('AB123')).toBeFalse();
  });

  it('rejects all numbers', () => {
    expect(isValidPlate('123456')).toBeFalse();
  });

  it('rejects 7+ chars', () => {
    expect(isValidPlate('ABCD123')).toBeFalse();
  });

  it('rejects empty string', () => {
    expect(isValidPlate('')).toBeFalse();
  });

  it('validates normalized input', () => {
    expect(isValidPlate(normalizePlate('abc-123'))).toBeTrue();
  });
});

describe('formatPlate', () => {
  it('formats ABC123 as ABC-123', () => {
    expect(formatPlate('ABC123')).toBe('ABC-123');
  });

  it('returns prefix only for short input', () => {
    expect(formatPlate('AB')).toBe('AB');
  });

  it('handles lowercase input', () => {
    expect(formatPlate('abc123')).toBe('ABC-123');
  });
});
