import { WHATSAPP_NUMBER_PATTERN } from './whatsapp-number';

describe('WHATSAPP_NUMBER_PATTERN', () => {
  it.each([
    '+6281234567890',
    '081234567890',
    '+62 812-3456-7890',
    '(021) 5315 0000',
    '6281234567890',
  ])('accepts %s', (value) => {
    expect(WHATSAPP_NUMBER_PATTERN.test(value)).toBe(true);
  });

  it('accepts the empty string, which is how an admin clears the number', () => {
    expect(WHATSAPP_NUMBER_PATTERN.test('')).toBe(true);
  });

  it.each([
    'abc',
    '+62 812 abc 7890',
    '12345',
    'wa.me/6281234567890',
    '+',
    '081234567890; DROP TABLE users',
  ])('rejects %s', (value) => {
    expect(WHATSAPP_NUMBER_PATTERN.test(value)).toBe(false);
  });
});
