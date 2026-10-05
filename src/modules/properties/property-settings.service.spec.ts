import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PropertySettingsService } from './property-settings.service';
import { PropertySettings } from './entities/property-settings.entity';
import { SiteConfigCacheService } from '../site-config/site-config-cache.service';

function makeSettings(
  overrides: Partial<PropertySettings> = {},
): PropertySettings {
  return {
    id: 'ps-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    singleton: true,
    kprAnnualRateBps: 175,
    kprTenorYears: 25,
    ...overrides,
  };
}

describe('PropertySettingsService', () => {
  let service: PropertySettingsService;
  let repo: {
    findOne: jest.Mock<Promise<PropertySettings | null>, [unknown?]>;
    create: jest.Mock<PropertySettings, [Partial<PropertySettings>]>;
    save: jest.Mock<Promise<PropertySettings>, [PropertySettings]>;
  };
  let siteConfigCache: { bust: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn<Promise<PropertySettings | null>, [unknown?]>(),
      create: jest.fn((e: Partial<PropertySettings>) => makeSettings(e)),
      save: jest.fn((e: PropertySettings) => Promise.resolve(e)),
    };
    siteConfigCache = { bust: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertySettingsService,
        { provide: getRepositoryToken(PropertySettings), useValue: repo },
        { provide: SiteConfigCacheService, useValue: siteConfigCache },
      ],
    }).compile();

    service = module.get(PropertySettingsService);
  });

  describe('get', () => {
    it('returns the existing row', async () => {
      const existing = makeSettings({ kprAnnualRateBps: 350 });
      repo.findOne.mockResolvedValue(existing);

      expect(await service.get()).toBe(existing);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('auto-seeds the values the website used to hardcode when no row exists', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.get();

      expect(repo.create).toHaveBeenCalledWith({
        singleton: true,
        kprAnnualRateBps: 175,
        kprTenorYears: 25,
      });
      expect(result.kprAnnualRateBps).toBe(175);
    });
  });

  describe('update', () => {
    it('stores the rate as whole basis points and busts the site-config cache', async () => {
      repo.findOne.mockResolvedValue(makeSettings());

      await service.update({ kprAnnualRatePct: 3.25 });

      const saved = repo.save.mock.calls[0][0];
      expect(saved.kprAnnualRateBps).toBe(325);
      expect(saved.kprTenorYears).toBe(25);
      expect(siteConfigCache.bust).toHaveBeenCalledTimes(1);
    });

    it('does not let float error leak into the stored value (1.15 * 100 is 114.99999999999999)', async () => {
      repo.findOne.mockResolvedValue(makeSettings());

      await service.update({ kprAnnualRatePct: 1.15 });

      expect(repo.save.mock.calls[0][0].kprAnnualRateBps).toBe(115);
    });

    it('accepts a rate of 0 (an interest-free promo is a real value, not "unset")', async () => {
      repo.findOne.mockResolvedValue(makeSettings());

      await service.update({ kprAnnualRatePct: 0 });

      expect(repo.save.mock.calls[0][0].kprAnnualRateBps).toBe(0);
    });

    it('only changes the tenor when only the tenor is sent', async () => {
      repo.findOne.mockResolvedValue(makeSettings());

      await service.update({ kprTenorYears: 15 });

      const saved = repo.save.mock.calls[0][0];
      expect(saved.kprTenorYears).toBe(15);
      expect(saved.kprAnnualRateBps).toBe(175);
    });
  });

  describe('toDto', () => {
    it('converts basis points back to a percent exactly', () => {
      expect(
        service.toDto(
          makeSettings({ kprAnnualRateBps: 175, kprTenorYears: 25 }),
        ),
      ).toEqual({ kprAnnualRatePct: 1.75, kprTenorYears: 25 });
    });
  });
});
