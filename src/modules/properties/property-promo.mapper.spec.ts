// `media.service.ts` (imported transitively via PropertyPromoMapper)
// imports the `uuid` package's ESM build, which this repo's jest config
// doesn't have a transform for — no existing spec happened to exercise
// that import path before this one. Stubbing the package here (rather
// than widening jest's global transformIgnorePatterns) keeps the fix
// scoped to this test file; the real MediaService class is still used,
// just with its uuid import satisfied by a stand-in.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { PropertyPromoMapper } from './property-promo.mapper';
import { ContentBlock } from '../content-blocks/entities/content-block.entity';
import { ContentBlockType } from '../content-blocks/enums/content-block-type.enum';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { MediaService, MediaImageDto } from '../media/media.service';

/** Directly instantiated (no Test.createTestingModule) — this class exists
 * specifically so the buildImageDto-throws branch can be exercised as a
 * plain function call. See the class's own doc comment. */
function makeMapper(mediaService: Partial<MediaService> = {}) {
  return new PropertyPromoMapper(mediaService as MediaService);
}

function makeBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'promo-1',
    type: ContentBlockType.PROPERTY_PROMO,
    mediaAsset: null,
    mediaAssetId: null,
    title: 'Jasa Inspeksi Properti',
    subtitle: 'Pastikan kondisi bangunan sebelum Anda membeli.',
    ctaText: 'Jadwalkan Inspeksi',
    link: 'https://wa.me/628123456789',
    sortOrder: 0,
    isActive: true,
    imageOnly: false,
    listingTypeScope: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const fakeImage: MediaImageDto = {
  url: 'https://cdn.example/img.webp',
  srcset: '',
  srcsetAvif: '',
  placeholder: null,
  alt: null,
  width: 800,
  height: 450,
};

describe('PropertyPromoMapper', () => {
  it('renames subtitle -> body and link -> ctaLink', () => {
    const mapper = makeMapper();
    const [card] = mapper.toCards([makeBlock()]);
    expect(card.body).toBe('Pastikan kondisi bangunan sebelum Anda membeli.');
    expect(card.ctaLink).toBe('https://wa.me/628123456789');
  });

  it('returns image: null when no media asset is attached', () => {
    const mapper = makeMapper();
    const [card] = mapper.toCards([makeBlock({ mediaAsset: null })]);
    expect(card.image).toBeNull();
  });

  it('builds the image via MediaService when a media asset is attached', () => {
    const buildImageDto = jest.fn().mockReturnValue(fakeImage);
    const mapper = makeMapper({ buildImageDto });
    const asset = { id: 'asset-1' } as MediaAsset;
    const [card] = mapper.toCards([makeBlock({ mediaAsset: asset })]);
    expect(buildImageDto).toHaveBeenCalledWith(asset);
    expect(card.image).toEqual(fakeImage);
  });

  it('degrades to image: null (without throwing) when buildImageDto throws', () => {
    const buildImageDto = jest.fn(() => {
      throw new Error('no usable variants');
    });
    const mapper = makeMapper({ buildImageDto });
    const asset = { id: 'asset-1' } as MediaAsset;

    let cards: ReturnType<PropertyPromoMapper['toCards']> = [];
    expect(() => {
      cards = mapper.toCards([makeBlock({ mediaAsset: asset })]);
    }).not.toThrow();

    expect(cards).toHaveLength(1);
    expect(cards[0].image).toBeNull();
  });

  it('drops an imageOnly card entirely when its image is unusable', () => {
    const buildImageDto = jest.fn(() => {
      throw new Error('no usable variants');
    });
    const mapper = makeMapper({ buildImageDto });
    const asset = { id: 'asset-1' } as MediaAsset;

    const cards = mapper.toCards([
      makeBlock({ imageOnly: true, mediaAsset: asset }),
    ]);
    expect(cards).toHaveLength(0);
  });

  it('keeps an imageOnly card when its image builds successfully', () => {
    const buildImageDto = jest.fn().mockReturnValue(fakeImage);
    const mapper = makeMapper({ buildImageDto });
    const asset = { id: 'asset-1' } as MediaAsset;

    const cards = mapper.toCards([
      makeBlock({ imageOnly: true, mediaAsset: asset }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].image).toEqual(fakeImage);
  });

  it('preserves input order rather than re-sorting', () => {
    const mapper = makeMapper();
    const cards = mapper.toCards([
      makeBlock({ id: 'a', sortOrder: 5 }),
      makeBlock({ id: 'b', sortOrder: 1 }),
    ]);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
