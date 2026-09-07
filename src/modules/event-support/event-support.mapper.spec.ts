import { Test, TestingModule } from '@nestjs/testing';
import { EventSupportMapper } from './event-support.mapper';
import { MediaService } from '../media/media.service';
import { EventBookingStatus } from './enums/event-booking-status.enum';
import { EventBillingMode } from './enums/event-billing-mode.enum';

// EventSupportMapper's real MediaService import transitively pulls in the
// ESM-only `uuid` package (see storage-bookings.service.spec.ts's identical
// comment) — nothing under test here touches media, so mock it away.
jest.mock('../media/media.service', () => ({ MediaService: jest.fn() }));

function makeQuoteComputation() {
  return {
    lines: [
      {
        item: { slug: 'sound-system', name: 'Sound System' },
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T17:00',
        startDate: '2026-03-01',
        endDate: '2026-03-01',
        billingMode: EventBillingMode.EIGHT_HOUR,
        unitPrice: 50_000,
        unitLabel: '8 jam' as const,
        billableUnits: 1,
        lineTotal: 400_000,
        availableQuantity: 3,
      },
    ],
    dropoffAt: '2026-03-01T09:00',
    pickupAt: '2026-03-01T17:00',
    startDate: '2026-03-01',
    endDate: '2026-03-01',
    isMixedBilling: false,
    subtotal: 400_000,
    discountAmount: 0,
    total: 400_000,
    eventLocation: null,
  };
}

const settings = { priceIncludesJabodetabekDelivery: true } as never;

describe('EventSupportMapper', () => {
  let mapper: EventSupportMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventSupportMapper, { provide: MediaService, useValue: {} }],
    }).compile();
    mapper = module.get(EventSupportMapper);
  });

  it('toQuoteDto builds a message with no reference line (byte-stable quote output)', () => {
    const dto = mapper.toQuoteDto(makeQuoteComputation() as never, settings);
    expect(dto.whatsappMessage).not.toContain('No. Referensi');
    expect(
      dto.whatsappMessage.startsWith('Halo Mandana, saya ingin menyewa'),
    ).toBe(true);
  });

  it('toBookingPublicDto builds a message with the booking reference', () => {
    const booking = {
      id: 'booking-1',
      reference: 'MDN-EVT-A7K92X',
      status: EventBookingStatus.PENDING,
      customerName: 'Budi Santoso',
      phone: null,
      email: null,
      eventLocation: null,
      notes: null,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
      startDate: '2026-03-01',
      endDate: '2026-03-01',
      subtotal: 400_000,
      discountAmount: 0,
      total: 400_000,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    } as never;

    const dto = mapper.toBookingPublicDto(
      booking,
      makeQuoteComputation() as never,
      settings,
    );

    expect(dto.whatsappMessage).toContain('No. Referensi: MDN-EVT-A7K92X');
    expect(
      dto.whatsappMessage.startsWith(
        'Halo Mandana, saya baru saja mengajukan pesanan',
      ),
    ).toBe(true);
    expect(dto.currency).toBe('IDR');
    expect(dto.reference).toBe('MDN-EVT-A7K92X');
  });
});
