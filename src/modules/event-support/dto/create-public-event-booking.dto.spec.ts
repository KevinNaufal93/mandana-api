import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePublicEventBookingDto } from './create-public-event-booking.dto';

function build(
  overrides: Record<string, unknown> = {},
): CreatePublicEventBookingDto {
  return plainToInstance(CreatePublicEventBookingDto, {
    customerName: 'Budi Santoso',
    dropoffAt: '2026-03-01T09:00',
    pickupAt: '2026-03-01T17:00',
    items: [{ slug: 'medium-venue-package', quantity: 1 }],
    ...overrides,
  });
}

describe('CreatePublicEventBookingDto validation', () => {
  it('accepts a minimal valid booking', async () => {
    const errors = await validate(build());
    expect(errors).toHaveLength(0);
  });

  it('accepts optional contact fields', async () => {
    const errors = await validate(
      build({
        phone: '+628123456789',
        email: 'budi@example.com',
        eventLocation: 'Balai Sarbini, Jakarta Selatan',
        notes: 'Perlu akses loading dock jam 08:00',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('requires customerName', async () => {
    const errors = await validate(build({ customerName: undefined }));
    expect(errors.some((e) => e.property === 'customerName')).toBe(true);
  });

  it('rejects a customerName shorter than 2 characters', async () => {
    const errors = await validate(build({ customerName: 'B' }));
    expect(errors.some((e) => e.property === 'customerName')).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const errors = await validate(build({ email: 'not-an-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  // The inherited window validators — proves extending QuoteEventSupportDto
  // actually wired them up, not just the shape.
  it('rejects a dropoffAt with a timezone offset (inherited @IsNaiveLocalDateTime)', async () => {
    const errors = await validate(
      build({ dropoffAt: '2026-03-01T09:00:00+07:00' }),
    );
    expect(errors.some((e) => e.property === 'dropoffAt')).toBe(true);
  });

  it('rejects a pickupAt before dropoffAt (inherited @ValidRentalWindow)', async () => {
    const errors = await validate(
      build({ dropoffAt: '2026-03-01T17:00', pickupAt: '2026-03-01T09:00' }),
    );
    expect(errors.some((e) => e.property === 'pickupAt')).toBe(true);
  });

  it('accepts a per-line window override (inherited from QuoteEventSupportItemDto)', async () => {
    const errors = await validate(
      build({
        items: [
          {
            slug: 'medium-venue-package',
            quantity: 1,
            dropoffAt: '2026-03-01T10:00',
            pickupAt: '2026-03-01T16:00',
          },
        ],
      }),
    );
    expect(errors).toHaveLength(0);
  });
});
