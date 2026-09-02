import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMovingLeadDto } from './create-moving-lead.dto';

function build(overrides: Record<string, unknown> = {}): CreateMovingLeadDto {
  return plainToInstance(CreateMovingLeadDto, {
    truckSlug: 'cdd',
    distanceMeters: 20_000,
    pickup: { lat: -6.2, lng: 106.8 },
    destinations: [{ lat: -6.3, lng: 106.9 }],
    ...overrides,
  });
}

describe('CreateMovingLeadDto validation', () => {
  it('accepts a valid single-destination body', async () => {
    const errors = await validate(build());
    expect(errors).toHaveLength(0);
  });

  it('accepts a many-stop destination list (up to the 25-entry abuse guard)', async () => {
    const destinations = Array.from({ length: 25 }, (_, i) => ({
      lat: -6.2 - i * 0.001,
      lng: 106.8 + i * 0.001,
    }));
    const errors = await validate(build({ destinations }));
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty destinations array', async () => {
    const errors = await validate(build({ destinations: [] }));
    expect(errors.some((e) => e.property === 'destinations')).toBe(true);
  });

  it('rejects more than 25 destinations', async () => {
    const destinations = Array.from({ length: 26 }, () => ({
      lat: -6.2,
      lng: 106.8,
    }));
    const errors = await validate(build({ destinations }));
    expect(errors.some((e) => e.property === 'destinations')).toBe(true);
  });

  it('rejects an out-of-range latitude on a destination', async () => {
    const errors = await validate(
      build({ destinations: [{ lat: 200, lng: 106.8 }] }),
    );
    expect(errors.some((e) => e.property === 'destinations')).toBe(true);
  });

  it('rejects a missing pickup', async () => {
    const errors = await validate(build({ pickup: undefined }));
    expect(errors.some((e) => e.property === 'pickup')).toBe(true);
  });

  it('still enforces inherited QuoteMovingDto rules — truckSlug is required', async () => {
    const errors = await validate(build({ truckSlug: undefined }));
    expect(errors.some((e) => e.property === 'truckSlug')).toBe(true);
  });

  it('accepts an optional "Additional notes" string', async () => {
    const errors = await validate(
      build({ notes: 'Barang mudah pecah, tolong hati-hati.' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects notes longer than 2000 characters', async () => {
    const errors = await validate(build({ notes: 'a'.repeat(2001) }));
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
