import { computeReadingMinutes } from './reading-time';

describe('computeReadingMinutes', () => {
  it('floors at 1 minute for empty text', () => {
    expect(computeReadingMinutes('')).toBe(1);
  });

  it('floors at 1 minute for short text', () => {
    expect(computeReadingMinutes('a few words here')).toBe(1);
  });

  it('rounds 200 words to 1 minute', () => {
    const text = Array(200).fill('kata').join(' ');
    expect(computeReadingMinutes(text)).toBe(1);
  });

  it('rounds 300 words to 2 minutes', () => {
    const text = Array(300).fill('kata').join(' ');
    expect(computeReadingMinutes(text)).toBe(2);
  });

  it('collapses extra whitespace before counting', () => {
    const text = Array(400).fill('kata').join('   \n  ');
    expect(computeReadingMinutes(text)).toBe(2);
  });
});
