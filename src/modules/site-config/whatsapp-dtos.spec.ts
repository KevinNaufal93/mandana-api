import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMovingSettingsDto } from '../moving/dto/update-moving-settings.dto';
import { UpdateStorageSettingsDto } from '../storage/dto/update-storage-settings.dto';
import { UpdateEventSupportSettingsDto } from '../event-support/dto/update-event-support-settings.dto';
import { UpdateSeoSettingsDto } from '../seo/dto/update-seo-settings.dto';

type Ctor = new () => { whatsappNumber?: string };

const DTOS: [string, Ctor][] = [
  ['UpdateMovingSettingsDto', UpdateMovingSettingsDto],
  ['UpdateStorageSettingsDto', UpdateStorageSettingsDto],
  ['UpdateEventSupportSettingsDto', UpdateEventSupportSettingsDto],
  ['UpdateSeoSettingsDto', UpdateSeoSettingsDto],
];

describe.each(DTOS)('%s whatsappNumber', (_name, Dto) => {
  async function errorsFor(whatsappNumber: unknown): Promise<number> {
    const instance = plainToInstance(Dto, { whatsappNumber });
    return (await validate(instance)).length;
  }

  it.each(['+6281234567890', '0812 3456 7890', '(021) 5315 0000', ''])(
    'accepts %p',
    async (value) => {
      expect(await errorsFor(value)).toBe(0);
    },
  );

  it('accepts a number pasted with stray spaces and trims it before validating', async () => {
    const instance = plainToInstance(Dto, {
      whatsappNumber: '  +62 811-1111-0001 ',
    });

    expect(await validate(instance)).toHaveLength(0);
    expect(instance.whatsappNumber).toBe('+62 811-1111-0001');
  });

  it('is optional: a patch that omits it validates', async () => {
    expect(await errorsFor(undefined)).toBe(0);
  });

  it.each(['abc', '12345', '0812; DROP TABLE x', 'wa.me/6281234567890'])(
    'rejects %p',
    async (value) => {
      expect(await errorsFor(value)).toBeGreaterThan(0);
    },
  );

  it('rejects anything over 32 characters', async () => {
    expect(await errorsFor('1'.repeat(33))).toBeGreaterThan(0);
  });
});
