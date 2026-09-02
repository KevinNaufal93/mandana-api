import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovingService } from './moving.service';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingAddonKind } from './enums/moving-addon-kind.enum';
import { MovingAddonPricingModel } from './enums/moving-addon-pricing-model.enum';
import { QuoteMovingDto } from './dto/quote-moving.dto';

/**
 * First unit test for MovingService. Exists mainly to guard the
 * quote() -> buildQuote() extraction (see moving.service.ts): buildQuote()
 * must keep every validation branch, and quote()'s public response shape —
 * a contract mandana-web already depends on — must stay byte-identical.
 */

const cdd: TruckClass = {
  id: 'truck-1',
  name: 'CDD (Colt Diesel Double)',
  slug: 'cdd',
  description: null,
  capacityKg: 4000,
  volumeM3: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  helperCount: 2,
  baseFare: 850_000,
  perKmFare: 8_000,
  includedKm: 5,
  minFare: 850_000,
  mediaAsset: null,
  mediaAssetId: null,
  isActive: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const settings: MovingSettings = {
  id: 'settings-1',
  singleton: true,
  roundToIdr: 10_000,
  bandPct: 10,
  defaultIncludedKm: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const insuranceAddon: MovingAddon = {
  id: 'addon-1',
  name: 'Asuransi Barang',
  slug: 'insurance',
  description: null,
  kind: MovingAddonKind.INSURANCE,
  pricingModel: MovingAddonPricingModel.PERCENT,
  unitPrice: 0,
  percentBps: 20,
  minCharge: 50_000,
  maxCharge: null,
  unitLabel: null,
  minQty: 1,
  maxQty: 1,
  doublesOnRoundTrip: false,
  mediaAsset: null,
  mediaAssetId: null,
  isActive: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tollAddon: MovingAddon = {
  ...insuranceAddon,
  id: 'addon-2',
  name: 'Estimasi Tol',
  slug: 'toll-estimate',
  kind: MovingAddonKind.TOLL,
  pricingModel: MovingAddonPricingModel.PER_UNIT,
  unitPrice: 1_300,
  percentBps: null,
  minCharge: 0,
};

describe('MovingService', () => {
  let service: MovingService;
  let truckRepo: { findOne: jest.Mock };
  let addonsService: {
    findActiveBySlugs: jest.Mock;
    findActiveToll: jest.Mock;
  };
  let settingsService: { get: jest.Mock };

  beforeEach(async () => {
    truckRepo = { findOne: jest.fn() };
    addonsService = {
      findActiveBySlugs: jest.fn(),
      findActiveToll: jest.fn(),
    };
    settingsService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovingService,
        {
          provide: getRepositoryToken(TruckClass),
          useValue: truckRepo,
        },
        { provide: MovingAddonsService, useValue: addonsService },
        { provide: MovingSettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(MovingService);

    truckRepo.findOne.mockResolvedValue(cdd);
    settingsService.get.mockResolvedValue(settings);
    addonsService.findActiveBySlugs.mockResolvedValue([]);
    addonsService.findActiveToll.mockResolvedValue(null);
  });

  const baseDto: QuoteMovingDto = {
    truckSlug: 'cdd',
    distanceMeters: 20_000,
  };

  describe('buildQuote', () => {
    it('resolves the truck and prices the request', async () => {
      const { truck, result } = await service.buildQuote(baseDto);
      expect(truck.slug).toBe('cdd');
      expect(result.distanceKm).toBe(20);
      expect(result.total).toBeGreaterThan(0);
    });

    it('throws 404 for an unknown/inactive truckSlug', async () => {
      truckRepo.findOne.mockResolvedValue(null);
      await expect(service.buildQuote(baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 400 on a duplicate addon slug', async () => {
      await expect(
        service.buildQuote({
          ...baseDto,
          addons: [{ slug: 'helper' }, { slug: 'helper' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when a toll addon is selected directly instead of via tollRoute', async () => {
      addonsService.findActiveBySlugs.mockResolvedValue([tollAddon]);
      await expect(
        service.buildQuote({
          ...baseDto,
          addons: [{ slug: 'toll-estimate' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when a percent-priced addon is selected without declaredValue', async () => {
      addonsService.findActiveBySlugs.mockResolvedValue([insuranceAddon]);
      await expect(
        service.buildQuote({ ...baseDto, addons: [{ slug: 'insurance' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a percent-priced addon when declaredValue is provided', async () => {
      addonsService.findActiveBySlugs.mockResolvedValue([insuranceAddon]);
      const { result } = await service.buildQuote({
        ...baseDto,
        addons: [{ slug: 'insurance' }],
        declaredValue: 50_000_000,
      });
      expect(result.addons).toHaveLength(1);
      expect(result.addons[0].slug).toBe('insurance');
    });
  });

  describe('quote', () => {
    it('returns the exact public response shape (regression guard for the buildQuote() extraction)', async () => {
      const response = await service.quote(baseDto);
      expect(response).toEqual({
        truck: { slug: 'cdd', name: 'CDD (Colt Diesel Double)' },
        distanceKm: 20,
        includedKm: 5,
        chargeableKm: 15,
        roundTrip: false,
        tripMultiplier: 1,
        baseFare: 850_000,
        distanceFare: 120_000,
        travelSubtotal: 970_000,
        tollRoute: true,
        tollFare: 0,
        addons: [],
        addonsTotal: 0,
        subtotal: 970_000,
        total: 970_000,
        minFareApplied: false,
        lowEstimate: 870_000,
        highEstimate: 1_070_000,
        currency: 'IDR',
      });
    });
  });
});
