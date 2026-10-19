import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

// StorageAvailabilityService -> StorageMapper pulls in MediaService, which
// imports the ESM-only `uuid` package that Jest's CJS transform can't parse.
// Nothing under test touches media — same short-circuit as the bookings spec.
jest.mock('../media/media.service', () => ({ MediaService: jest.fn() }));
import { StorageUnitsService } from './storage-units.service';
import { StorageUnit } from './entities/storage-unit.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageUnitStatus } from './enums/storage-unit-status.enum';

function makeUnit(overrides: Partial<StorageUnit> = {}): StorageUnit {
  return {
    id: 'unit-1',
    code: 'S-01',
    status: StorageUnitStatus.AVAILABLE,
    bookingId: null,
    ...overrides,
  } as StorageUnit;
}

describe('StorageUnitsService delete guards', () => {
  let service: StorageUnitsService;
  let unitRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    remove: jest.Mock;
  };
  let availability: { publish: jest.Mock };

  beforeEach(async () => {
    unitRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    availability = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageUnitsService,
        { provide: getRepositoryToken(StorageUnit), useValue: unitRepo },
        { provide: getRepositoryToken(StorageFacility), useValue: {} },
        { provide: getRepositoryToken(StorageUnitType), useValue: {} },
        { provide: StorageAvailabilityService, useValue: availability },
      ],
    }).compile();

    service = module.get(StorageUnitsService);
  });

  describe('remove', () => {
    it('deletes an available unit and publishes', async () => {
      const unit = makeUnit();
      unitRepo.findOne.mockResolvedValue(unit);

      await service.remove('unit-1');

      expect(unitRepo.remove).toHaveBeenCalledWith(unit);
      expect(availability.publish).toHaveBeenCalledTimes(1);
    });

    it('deletes a unit under maintenance', async () => {
      unitRepo.findOne.mockResolvedValue(
        makeUnit({ status: StorageUnitStatus.MAINTENANCE }),
      );

      await service.remove('unit-1');

      expect(unitRepo.remove).toHaveBeenCalledTimes(1);
    });

    it('refuses an occupied unit with a 409 naming its code, and deletes nothing', async () => {
      unitRepo.findOne.mockResolvedValue(
        makeUnit({
          code: 'S-05',
          status: StorageUnitStatus.OCCUPIED,
          bookingId: 'booking-1',
        }),
      );

      const attempt = service.remove('unit-1');

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow('S-05');
      expect(unitRepo.remove).not.toHaveBeenCalled();
      expect(availability.publish).not.toHaveBeenCalled();
    });

    it('refuses a unit that still carries a booking even if its status drifted', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ bookingId: 'booking-1' }));

      await expect(service.remove('unit-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(unitRepo.remove).not.toHaveBeenCalled();
    });

    it('still 404s for an unknown id', async () => {
      unitRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('bulkRemove', () => {
    it('deletes every unit when all exist and none is occupied', async () => {
      const units = [
        makeUnit({ id: 'a', code: 'S-01' }),
        makeUnit({ id: 'b', code: 'S-02' }),
      ];
      unitRepo.find.mockResolvedValue(units);

      await service.bulkRemove({ ids: ['a', 'b'] });

      expect(unitRepo.remove).toHaveBeenCalledWith(units);
      expect(availability.publish).toHaveBeenCalledTimes(1);
    });

    it('is atomic: one occupied unit blocks the whole set and every occupied code is named', async () => {
      unitRepo.find.mockResolvedValue([
        makeUnit({ id: 'a', code: 'S-01' }),
        makeUnit({
          id: 'b',
          code: 'S-02',
          status: StorageUnitStatus.OCCUPIED,
          bookingId: 'booking-1',
        }),
        makeUnit({
          id: 'c',
          code: 'S-03',
          status: StorageUnitStatus.OCCUPIED,
          bookingId: 'booking-2',
        }),
      ]);

      const attempt = service.bulkRemove({ ids: ['a', 'b', 'c'] });

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow('S-02, S-03');
      expect(unitRepo.remove).not.toHaveBeenCalled();
      expect(availability.publish).not.toHaveBeenCalled();
    });

    it('reports a missing id as 404 before looking at occupancy', async () => {
      unitRepo.find.mockResolvedValue([
        makeUnit({
          id: 'a',
          status: StorageUnitStatus.OCCUPIED,
          bookingId: 'booking-1',
        }),
      ]);

      await expect(
        service.bulkRemove({ ids: ['a', 'missing'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(unitRepo.remove).not.toHaveBeenCalled();
    });
  });
});
