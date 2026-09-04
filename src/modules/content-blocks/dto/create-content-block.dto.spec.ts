import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContentBlockDto } from './create-content-block.dto';
import { UpdateContentBlockDto } from './update-content-block.dto';
import { ContentBlockType } from '../enums/content-block-type.enum';

function build(overrides: Record<string, unknown> = {}): CreateContentBlockDto {
  return plainToInstance(CreateContentBlockDto, {
    type: ContentBlockType.PROPERTY_PROMO,
    title: 'Jasa Inspeksi Properti',
    ...overrides,
  });
}

describe('CreateContentBlockDto — listingTypeScope validation', () => {
  it('accepts an omitted listingTypeScope', async () => {
    const errors = await validate(build());
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('accepts a valid scope array', async () => {
    const errors = await validate(build({ listingTypeScope: ['sale', 'new'] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('accepts an empty array', async () => {
    const errors = await validate(build({ listingTypeScope: [] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('rejects an unknown listing type value', async () => {
    const errors = await validate(build({ listingTypeScope: ['bogus'] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(true);
  });

  it('rejects duplicate values', async () => {
    const errors = await validate(
      build({ listingTypeScope: ['sale', 'sale'] }),
    );
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(true);
  });

  it('rejects a non-array value', async () => {
    const errors = await validate(build({ listingTypeScope: 'sale' }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(true);
  });

  // The cross-field "only valid on property_promo" rule is deliberately NOT
  // enforced at the DTO layer (see the field's comment) — it depends on the
  // sibling `type` field in a way that must produce a specific 400, not
  // silently skip validation for other types. ContentBlocksService owns it.
  it('does not itself reject a scope on a non-property_promo type — that is the service layer’s job', async () => {
    const errors = await validate(
      build({ type: ContentBlockType.HERO, listingTypeScope: ['sale'] }),
    );
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });
});

describe('UpdateContentBlockDto — listingTypeScope validation', () => {
  function buildUpdate(
    overrides: Record<string, unknown> = {},
  ): UpdateContentBlockDto {
    return plainToInstance(UpdateContentBlockDto, { ...overrides });
  }

  it('accepts null (explicit clear)', async () => {
    const errors = await validate(buildUpdate({ listingTypeScope: null }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('accepts an empty array', async () => {
    const errors = await validate(buildUpdate({ listingTypeScope: [] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('accepts a valid scope array', async () => {
    const errors = await validate(buildUpdate({ listingTypeScope: ['rent'] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(false);
  });

  it('rejects an unknown listing type value', async () => {
    const errors = await validate(buildUpdate({ listingTypeScope: ['bogus'] }));
    expect(errors.some((e) => e.property === 'listingTypeScope')).toBe(true);
  });
});
