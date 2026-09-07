import { NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Subscription } from 'rxjs';
import { POSTGRES_UNIQUE_VIOLATION } from '../../common/utils/booking-reference';
import { NotificationsService } from './notifications.service';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationSourceModule } from './enums/notification-source-module.enum';
import { NotificationOrigin } from './enums/notification-origin.enum';
import { NotificationFilter } from './enums/notification-filter.enum';
import { QueryAdminNotificationsDto } from './dto/query-admin-notifications.dto';

type RepoMock = {
  create: jest.Mock;
  save: jest.Mock;
  count: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function makeRepo(): RepoMock {
  return {
    create: jest.fn((input: unknown) => input),
    save: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function makeNotification(
  overrides: Partial<AdminNotification> = {},
): AdminNotification {
  return {
    id: 'notif-1',
    sourceModule: NotificationSourceModule.STORAGE,
    sourceId: 'booking-1',
    reference: 'MDN-STG-ABC123',
    customerName: 'Budi',
    total: 1_200_000,
    origin: NotificationOrigin.CUSTOMER,
    readAt: null,
    resolvedAt: null,
    resolvedStatus: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: RepoMock;
  let mapper: {
    toDto: jest.Mock;
    toCreatedEvent: jest.Mock;
    toSnapshotEvent: jest.Mock;
  };
  let events: unknown[];
  let subscription: Subscription;

  beforeEach(() => {
    repo = makeRepo();
    mapper = {
      toDto: jest.fn((n: AdminNotification) => ({ id: n.id })),
      toCreatedEvent: jest.fn((n: AdminNotification, summary: unknown) => ({
        id: n.id,
        ...(summary as object),
      })),
      // Never actually reached in this file's tests: buildSnapshot()'s own
      // findAllAdmin() call throws synchronously on the unconfigured
      // createQueryBuilder mock, every time stream() is subscribed in
      // beforeEach below -- caught internally by snapshot$()'s own
      // catchError, so it never reaches toSnapshotEvent or the events
      // array. Present purely to satisfy NotificationsMapper's shape.
      toSnapshotEvent: jest.fn(),
    };
    service = new NotificationsService(
      repo as unknown as ConstructorParameters<typeof NotificationsService>[0],
      mapper,
    );

    events = [];
    // Subject.next emits synchronously, so a plain subscribe() here captures
    // every emission with no fake timers needed, as long as no test in this
    // file advances real time -- stream()'s heartbeat interval(15_000) never
    // gets the chance to fire on its own.
    subscription = service.stream().subscribe((e) => events.push(e));

    // stream() now also fires a notification.snapshot on every subscribe,
    // which synchronously calls repo.createQueryBuilder/repo.count via
    // buildSnapshot()'s own findAllAdmin()/getSummary() (it then rejects,
    // caught internally by snapshot$()'s own catchError, since this fresh
    // repo mock has neither configured yet). Clear call history -- but not
    // the mockResolvedValue/mockImplementation config from makeRepo() above
    // -- so each test's own assertions about what IT called start from
    // zero, same as before stream() had a snapshot.
    jest.clearAllMocks();
  });

  afterEach(() => {
    subscription.unsubscribe();
  });

  describe('emitCreated', () => {
    const input = {
      sourceModule: NotificationSourceModule.STORAGE,
      sourceId: 'booking-1',
      reference: 'MDN-STG-ABC123',
      customerName: 'Budi',
      total: 1_200_000,
      origin: NotificationOrigin.CUSTOMER,
    };

    it('saves one row and emits notification.created', async () => {
      const saved = makeNotification();
      repo.save.mockResolvedValue(saved);
      repo.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await service.emitCreated(input);

      expect(repo.create).toHaveBeenCalledWith(input);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'notification.created' });
    });

    it('is idempotent on a duplicate source module and source id pairing, emitting no second event', async () => {
      repo.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO "admin_notifications" ...', [], {
          code: POSTGRES_UNIQUE_VIOLATION,
          message: 'duplicate key value violates unique constraint',
        } as unknown as Error),
      );

      await expect(service.emitCreated(input)).resolves.toBeUndefined();

      expect(events).toHaveLength(0);
      expect(mapper.toCreatedEvent).not.toHaveBeenCalled();
    });

    it('swallows an unexpected save failure rather than throwing', async () => {
      repo.save.mockRejectedValue(new Error('connection reset'));

      await expect(service.emitCreated(input)).resolves.toBeUndefined();
      expect(events).toHaveLength(0);
    });
  });

  describe('resolveForBooking', () => {
    it('is a silent no-op when no notification row exists for the booking', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.resolveForBooking(
        NotificationSourceModule.STORAGE,
        'booking-without-a-notification',
        'confirmed',
      );

      expect(repo.save).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it('is a no-op when the notification is already resolved', async () => {
      repo.findOne.mockResolvedValue(
        makeNotification({
          resolvedAt: new Date(),
          resolvedStatus: 'confirmed',
        }),
      );

      await service.resolveForBooking(
        NotificationSourceModule.STORAGE,
        'booking-1',
        'cancelled',
      );

      expect(repo.save).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it('resolves the notification and emits the decremented unresolvedCount', async () => {
      const notification = makeNotification();
      repo.findOne.mockResolvedValue(notification);
      repo.save.mockResolvedValue(notification);
      // getSummary()'s two counts, in order: unresolvedCount, unreadCount.
      repo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      await service.resolveForBooking(
        NotificationSourceModule.STORAGE,
        'booking-1',
        'confirmed',
      );

      expect(notification.resolvedStatus).toBe('confirmed');
      expect(notification.resolvedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(notification);
      expect(events).toEqual([
        {
          type: 'notification.resolved',
          data: {
            id: notification.id,
            sourceModule: NotificationSourceModule.STORAGE,
            sourceId: 'booking-1',
            resolvedStatus: 'confirmed',
            unresolvedCount: 0,
          },
        },
      ]);
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.markRead('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is a no-op when already read', async () => {
      repo.findOne.mockResolvedValue(makeNotification({ readAt: new Date() }));
      await service.markRead('notif-1');
      expect(repo.save).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it('sets readAt, emits notification.read, and leaves resolvedAt untouched', async () => {
      const notification = makeNotification();
      repo.findOne.mockResolvedValue(notification);
      repo.save.mockResolvedValue(notification);
      repo.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);

      await service.markRead('notif-1');

      expect(notification.readAt).toBeInstanceOf(Date);
      expect(notification.resolvedAt).toBeNull();
      expect(events).toEqual([
        {
          type: 'notification.read',
          data: { ids: ['notif-1'], unreadCount: 2 },
        },
      ]);
    });
  });

  describe('markAllRead', () => {
    it('is a no-op when nothing is unread', async () => {
      repo.find.mockResolvedValue([]);
      await service.markAllRead();
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    // The core invariant: reading, even everything at once, must never move
    // unresolvedCount. markAllRead() only ever sets readAt; it does not even
    // call getSummary()'s resolvedAt-based count, since it always reports
    // unreadCount: 0 without needing to.
    it('updates only readAt, and reports unreadCount 0 without touching unresolvedCount', async () => {
      repo.find.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);
      const set = jest.fn().mockReturnThis();
      const qb = {
        update: jest.fn().mockReturnThis(),
        set,
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markAllRead();

      expect(set).toHaveBeenCalledTimes(1);
      // jest.fn() (untyped) makes .mock.calls an any[][] -- cast once here,
      // same convention as savedBookingArgs() in moving-bookings.service.spec.ts.
      const calls = set.mock.calls as [Record<string, unknown>][];
      expect(Object.keys(calls[0][0])).toEqual(['readAt']);
      expect(repo.count).not.toHaveBeenCalled(); // never re-derives unresolvedCount
      expect(events).toEqual([
        {
          type: 'notification.read',
          data: { ids: ['n1', 'n2'], unreadCount: 0 },
        },
      ]);
    });
  });

  describe('getSummary', () => {
    it('maps the two counts positionally: unresolvedCount first, unreadCount second', async () => {
      repo.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
      await expect(service.getSummary()).resolves.toEqual({
        unresolvedCount: 7,
        unreadCount: 3,
      });
    });
  });

  describe('findAllAdmin', () => {
    function makeQb() {
      const qb = {} as Record<string, jest.Mock>;
      const ret = () => qb;
      qb.andWhere = jest.fn(ret);
      qb.orderBy = jest.fn(ret);
      qb.addOrderBy = jest.fn(ret);
      qb.skip = jest.fn(ret);
      qb.take = jest.fn(ret);
      qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      return qb;
    }

    function makeQuery(
      overrides: Partial<QueryAdminNotificationsDto> = {},
    ): QueryAdminNotificationsDto {
      const dto = new QueryAdminNotificationsDto();
      dto.page = 1;
      dto.limit = 12;
      dto.filter = NotificationFilter.ALL;
      return Object.assign(dto, overrides);
    }

    it('applies no resolvedAt filter when filter is all', async () => {
      const qb = makeQb();
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAllAdmin(makeQuery());

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('resolvedAt'),
      );
    });

    it('filters to unresolved only when filter is unresolved', async () => {
      const qb = makeQb();
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAllAdmin(
        makeQuery({ filter: NotificationFilter.UNRESOLVED }),
      );

      expect(qb.andWhere).toHaveBeenCalledWith('n.resolvedAt IS NULL');
    });
  });
});
