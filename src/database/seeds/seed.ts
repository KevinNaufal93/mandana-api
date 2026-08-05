import 'dotenv/config';
import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { PropertyType } from '../../modules/properties/entities/property-type.entity';

const logger = new Logger('Seed');

async function seed() {
  await AppDataSource.initialize();
  logger.log('🌱 Seeding database...');

  const userRepo = AppDataSource.getRepository(User);
  const propertyTypeRepo = AppDataSource.getRepository(PropertyType);

  // --- Admin user ---
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@mandana.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';

  const existingAdmin = await userRepo.findOne({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await userRepo.save(
      userRepo.create({
        email: adminEmail,
        name: 'Super Admin',
        passwordHash,
        role: UserRole.ADMIN,
      }),
    );
    logger.log(`✅ Admin user created: ${adminEmail}`);
  } else {
    logger.log(`⏩ Admin user already exists, skipping`);
  }

  // --- Property types ---
  const types = [
    { name: 'Apartment', slug: 'apartment' },
    { name: 'House', slug: 'house' },
    { name: 'Villa', slug: 'villa' },
    { name: 'Land', slug: 'land' },
    { name: 'Commercial', slug: 'commercial' },
  ];

  const savedTypes: Record<string, PropertyType> = {};
  for (const t of types) {
    let pt = await propertyTypeRepo.findOne({ where: { slug: t.slug } });
    if (!pt) {
      pt = await propertyTypeRepo.save(propertyTypeRepo.create(t));
      logger.log(`✅ Property type: ${t.name}`);
    }
    savedTypes[t.slug] = pt;
  }

  await AppDataSource.destroy();
  logger.log('✅ Seed complete');
}

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
