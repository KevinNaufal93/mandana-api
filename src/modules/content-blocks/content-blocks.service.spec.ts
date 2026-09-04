import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ContentBlocksService } from './content-blocks.service';
import { ContentBlock } from './entities/content-block.entity';
import { ContentBlockType } from './enums/content-block-type.enum';
import { CreateContentBlockDto } from './dto/create-content-block.dto';
import { ListingType } from '../properties/enums/listing-type.enum';

/** Chainable stand-in for the SelectQueryBuilder findActivePropertyPromos()
 * builds — modeled on the same pattern used for MovingLeadsService's
 * buildFilteredQb() mock. */
interface QbMock {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
}

function makeQb(): QbMock {
  const qb = {} as QbMock;
  const ret = () => qb;
  qb.leftJoinAndSelect = jest.fn(ret);
  qb.where = jest.fn(ret);
  qb.andWhere = jest.fn(ret);
  qb.orderBy = jest.fn(ret);
  qb.addOrderBy = jest.fn(ret);
  qb.getMany = jest.fn().mockResolvedValue([]);
  return qb;
}

function makeBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'block-1',
    type: ContentBlockType.SERVICE_CARD,
    mediaAsset: null,
    mediaAssetId: null,
    title: 'Title',
    subtitle: null,
    ctaText: null,
    link: null,
    sortOrder: 0,
    isActive: true,
    imageOnly: false,
    listingTypeScope: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ContentBlocksService', () => {
  let service: ContentBlocksService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: QbMock;

  beforeEach(async () => {
    qb = makeQb();
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((entity: Partial<ContentBlock>) => entity),
      save: jest.fn((entity: ContentBlock) => Promise.resolve(entity)),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentBlocksService,
        { provide: getRepositoryToken(ContentBlock), useValue: repo },
      ],
    }).compile();

    service = module.get(ContentBlocksService);
  });

  describe('findActivePropertyPromos', () => {
    it('filters on type=property_promo, isActive=true, and the listing-type scope, ordered by sortOrder then createdAt', async () => {
      await service.findActivePropertyPromos(ListingType.RENT);

      expect(qb.where).toHaveBeenCalledWith('cb.type = :type', {
        type: ContentBlockType.PROPERTY_PROMO,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('cb.isActive = true');
      // `jest.Mock` (untyped) makes `.mock.calls` an `any[][]` — cast once
      // here, same idiom as MovingLeadsService's spec.
      const andWhereCalls = qb.andWhere.mock.calls as [
        string,
        Record<string, unknown>?,
      ][];
      const scopeCall = andWhereCalls.find(([sql]) =>
        sql.includes('cardinality'),
      );
      expect(scopeCall).toBeTruthy();
      expect(scopeCall?.[0]).toContain('IS NULL');
      expect(scopeCall?.[0]).toContain('ANY(cb.listingTypeScope)');
      expect(scopeCall?.[1]).toEqual({ listingType: ListingType.RENT });
      expect(qb.orderBy).toHaveBeenCalledWith('cb.sortOrder', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('cb.createdAt', 'ASC');
    });
  });

  describe('create', () => {
    const baseDto = (
      overrides: Partial<CreateContentBlockDto> = {},
    ): CreateContentBlockDto => ({
      type: ContentBlockType.PROPERTY_PROMO,
      title: 'Promo',
      ...overrides,
    });

    it('rejects a non-empty listingTypeScope on a non-property_promo type', async () => {
      await expect(
        service.create(
          baseDto({
            type: ContentBlockType.SERVICE_CARD,
            listingTypeScope: [ListingType.SALE],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an empty listingTypeScope on a non-property_promo type as a no-op', async () => {
      const saved = await service.create(
        baseDto({ type: ContentBlockType.SERVICE_CARD, listingTypeScope: [] }),
      );
      expect(saved.listingTypeScope).toBeNull();
    });

    it('stores a scoped property_promo card', async () => {
      const saved = await service.create(
        baseDto({ listingTypeScope: [ListingType.RENT, ListingType.NEW] }),
      );
      expect(saved.listingTypeScope).toEqual([
        ListingType.RENT,
        ListingType.NEW,
      ]);
    });

    it('normalizes an empty array to null on a property_promo card', async () => {
      const saved = await service.create(baseDto({ listingTypeScope: [] }));
      expect(saved.listingTypeScope).toBeNull();
    });
  });

  describe('update', () => {
    it('rejects flipping a scoped property_promo row to another type without clearing the scope', async () => {
      repo.findOne.mockResolvedValue(
        makeBlock({
          type: ContentBlockType.PROPERTY_PROMO,
          listingTypeScope: [ListingType.SALE],
        }),
      );

      await expect(
        service.update('block-1', {
          type: ContentBlockType.HERO,
          mediaAssetId: 'asset-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows flipping type when the scope is cleared in the same request', async () => {
      repo.findOne.mockResolvedValue(
        makeBlock({
          type: ContentBlockType.PROPERTY_PROMO,
          listingTypeScope: [ListingType.SALE],
        }),
      );

      const saved = await service.update('block-1', {
        type: ContentBlockType.HERO,
        mediaAssetId: 'asset-1',
        listingTypeScope: null,
      });
      expect(saved.listingTypeScope).toBeNull();
    });

    it('normalizes an empty array to null when clearing scope', async () => {
      repo.findOne.mockResolvedValue(
        makeBlock({
          type: ContentBlockType.PROPERTY_PROMO,
          listingTypeScope: [ListingType.SALE],
        }),
      );

      const saved = await service.update('block-1', {
        listingTypeScope: [],
      });
      expect(saved.listingTypeScope).toBeNull();
    });

    it('leaves an existing scope untouched when the key is omitted', async () => {
      repo.findOne.mockResolvedValue(
        makeBlock({
          type: ContentBlockType.PROPERTY_PROMO,
          listingTypeScope: [ListingType.SALE],
        }),
      );

      const saved = await service.update('block-1', {
        title: 'New title',
      });
      expect(saved.listingTypeScope).toEqual([ListingType.SALE]);
    });
  });
});
