import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { MovingLeadsService } from './moving-leads.service';
import { MovingService } from './moving.service';
import { MovingLead } from './entities/moving-lead.entity';
import { MovingLeadStop } from './entities/moving-lead-stop.entity';
import { MovingLeadAddon } from './entities/moving-lead-addon.entity';
import { MovingLeadStatus } from './enums/moving-lead-status.enum';
import { CreateMovingLeadDto } from './dto/create-moving-lead.dto';
import { MovingQuoteResult } from './moving-pricing';
import { POSTGRES_UNIQUE_VIOLATION } from '../../common/utils/booking-reference';

const truck = { slug: 'cdd', name: 'CDD (Colt Diesel Double)' };

const baseResult: MovingQuoteResult = {
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
};

function makeDto(destinationCount: number): CreateMovingLeadDto {
  return {
    truckSlug: 'cdd',
    distanceMeters: 20_000,
    pickup: { address: 'Origin', lat: -6.2, lng: 106.8 },
    destinations: Array.from({ length: destinationCount }, (_, i) => ({
      address: `Stop ${i}`,
      lat: -6.2 - i * 0.01,
      lng: 106.8 + i * 0.01,
    })),
  };
}

/** The shape MovingLeadsService.create() passes into leadRepo.create()/save()
 * — used only to type the mock's captured call args for assertions below. */
interface CreatedLeadInput {
  reference: string;
  status: MovingLeadStatus;
  truckSlug: string;
  truckName: string;
  stops: {
    stopIndex: number;
    address: string | null;
    lat: number;
    lng: number;
  }[];
}

interface StopInput {
  stopIndex: number;
  address: string | null;
  lat: number;
  lng: number;
}

interface AddonLineInput {
  addonSlug: string;
  addonName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** Reads the `leadRepo.save()` argument from a given call, cast once here
 * rather than at every call site — `jest.Mock` (untyped) makes `.mock.calls`
 * an `any[][]`, so this is the one place that leaves `any`. */
function savedLeadArgs(mock: jest.Mock, callIndex = 0): CreatedLeadInput {
  const calls = mock.mock.calls as CreatedLeadInput[][];
  return calls[callIndex][0];
}

describe('MovingLeadsService', () => {
  let service: MovingLeadsService;
  let leadRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let stopRepo: { create: jest.Mock };
  let addonRepo: { create: jest.Mock };
  let movingService: { buildQuote: jest.Mock };

  beforeEach(async () => {
    leadRepo = {
      create: jest.fn((input: CreatedLeadInput) => input),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    stopRepo = { create: jest.fn((input: StopInput) => input) };
    addonRepo = { create: jest.fn((input: AddonLineInput) => input) };
    movingService = { buildQuote: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovingLeadsService,
        { provide: getRepositoryToken(MovingLead), useValue: leadRepo },
        { provide: getRepositoryToken(MovingLeadStop), useValue: stopRepo },
        { provide: getRepositoryToken(MovingLeadAddon), useValue: addonRepo },
        { provide: MovingService, useValue: movingService },
      ],
    }).compile();

    service = module.get(MovingLeadsService);

    movingService.buildQuote.mockResolvedValue({ truck, result: baseResult });
    leadRepo.save.mockImplementation((lead: CreatedLeadInput) =>
      Promise.resolve({ ...lead, id: 'lead-1' }),
    );
    leadRepo.findOne.mockImplementation((options: unknown) => {
      const { id } = (options as { where: { id: string } }).where;
      return Promise.resolve({
        id,
        reference: 'MDN-MOV-ABC123',
        status: MovingLeadStatus.NEW,
        stops: [],
        addons: [],
      } as unknown as MovingLead);
    });
  });

  it('persists a single-destination lead with stopIndex 0', async () => {
    await service.create(makeDto(1));

    expect(leadRepo.save).toHaveBeenCalledTimes(1);
    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.stops).toHaveLength(1);
    expect(saved.stops[0]).toMatchObject({ stopIndex: 0, address: 'Stop 0' });
    expect(saved.reference).toMatch(/^MDN-MOV-/);
    expect(saved.status).toBe(MovingLeadStatus.NEW);
    expect(saved.truckSlug).toBe('cdd');
    expect(saved.truckName).toBe('CDD (Colt Diesel Double)');
  });

  it('persists an unlimited, ordered destination list — 3 stops in submitted order', async () => {
    await service.create(makeDto(3));

    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.stops).toHaveLength(3);
    expect(saved.stops.map((s) => s.stopIndex)).toEqual([0, 1, 2]);
    expect(saved.stops[0].address).toBe('Stop 0');
    expect(saved.stops[2].address).toBe('Stop 2');
  });

  it('never trusts a client-sent price — always recomputes via MovingService.buildQuote', async () => {
    await service.create(makeDto(1));
    expect(movingService.buildQuote).toHaveBeenCalledWith(
      expect.objectContaining({ truckSlug: 'cdd', distanceMeters: 20_000 }),
    );
  });

  it('retries with a fresh reference on a unique-constraint collision, then succeeds', async () => {
    const collision = new QueryFailedError(
      'INSERT INTO "moving_leads" ...',
      [],
      {
        code: POSTGRES_UNIQUE_VIOLATION,
        message: 'duplicate key value violates unique constraint',
      } as unknown as Error,
    );
    leadRepo.save
      .mockRejectedValueOnce(collision)
      .mockImplementationOnce((lead: CreatedLeadInput) =>
        Promise.resolve({ ...lead, id: 'lead-2' }),
      );

    await service.create(makeDto(1));

    expect(leadRepo.save).toHaveBeenCalledTimes(2);
    const firstRef = savedLeadArgs(leadRepo.save, 0).reference;
    const secondRef = savedLeadArgs(leadRepo.save, 1).reference;
    expect(firstRef).not.toBe(secondRef);
  });

  it('rethrows a non-collision error immediately, without retrying', async () => {
    leadRepo.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.create(makeDto(1))).rejects.toThrow('connection lost');
    expect(leadRepo.save).toHaveBeenCalledTimes(1);
  });
});
