import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSeoSettingsDto } from './update-seo-settings.dto';

async function errorProps(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateSeoSettingsDto, body));
  return errors.map((e) => e.property);
}

describe('UpdateSeoSettingsDto contactEmail', () => {
  it('accepts an empty string, which is how the admin form clears the email', async () => {
    expect(await errorProps({ contactEmail: '' })).toEqual([]);
  });

  it('accepts a real address and an omitted field', async () => {
    expect(await errorProps({ contactEmail: 'hello@mandana.id' })).toEqual([]);
    expect(await errorProps({})).toEqual([]);
  });

  it('still rejects something that is not an email', async () => {
    expect(await errorProps({ contactEmail: 'not-an-email' })).toEqual([
      'contactEmail',
    ]);
  });
});
