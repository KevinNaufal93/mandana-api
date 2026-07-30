import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { PropertyType } from '../../modules/properties/entities/property-type.entity';
import { Property } from '../../modules/properties/entities/property.entity';
import { PropertyImage } from '../../modules/properties/entities/property-image.entity';
import { ListingType } from '../../modules/properties/enums/listing-type.enum';
import { PropertyStatus } from '../../modules/properties/enums/property-status.enum';

async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Seeding database...');

  const userRepo = AppDataSource.getRepository(User);
  const propertyTypeRepo = AppDataSource.getRepository(PropertyType);
  const propertyRepo = AppDataSource.getRepository(Property);
  const imageRepo = AppDataSource.getRepository(PropertyImage);

  // --- Admin user ---
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@mandana.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';

  const existingAdmin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await userRepo.save(userRepo.create({
      email: adminEmail,
      name: 'Super Admin',
      passwordHash,
      role: UserRole.ADMIN,
    }));
    console.log(`✅ Admin user created: ${adminEmail}`);
  } else {
    console.log(`⏩ Admin user already exists, skipping`);
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
      console.log(`✅ Property type: ${t.name}`);
    }
    savedTypes[t.slug] = pt;
  }

  // --- Sample properties ---
  const samples = [
    {
      slug: 'modern-villa-bali-seminyak',
      title: 'Modern Villa in Seminyak Bali',
      description: 'Luxurious 4-bedroom villa with private pool in the heart of Seminyak.',
      listingType: ListingType.SALE,
      status: PropertyStatus.PUBLISHED,
      price: 8500000000,
      currency: 'IDR',
      bedrooms: 4,
      bathrooms: 4,
      areaSqm: 500,
      address: 'Jl. Raya Seminyak No. 88',
      city: 'Bali',
      latitude: -8.6905,
      longitude: 115.1627,
      isFeatured: true,
      propertyType: savedTypes['villa'],
      images: [
        { url: 'https://placehold.co/800x600?text=Villa+Seminyak+1', alt: 'Front view', isCover: true, sortOrder: 0 },
        { url: 'https://placehold.co/800x600?text=Villa+Seminyak+2', alt: 'Pool area', isCover: false, sortOrder: 1 },
      ],
    },
    {
      slug: 'studio-apartment-jakarta-scbd',
      title: 'Studio Apartment at SCBD Jakarta',
      description: 'Modern studio unit in the premium SCBD district, fully furnished.',
      listingType: ListingType.RENT,
      status: PropertyStatus.PUBLISHED,
      price: 12000000,
      currency: 'IDR',
      bedrooms: 0,
      bathrooms: 1,
      areaSqm: 38,
      address: 'Jl. Jend. Sudirman Kav 52-53',
      city: 'Jakarta',
      latitude: -6.2241,
      longitude: 106.8089,
      isFeatured: true,
      propertyType: savedTypes['apartment'],
      images: [
        { url: 'https://placehold.co/800x600?text=Studio+SCBD+1', alt: 'Living room', isCover: true, sortOrder: 0 },
      ],
    },
    {
      slug: 'townhouse-surabaya-westfield',
      title: 'Townhouse in Westfield Surabaya',
      description: 'Spacious 3-bedroom townhouse in a gated community.',
      listingType: ListingType.SALE,
      status: PropertyStatus.PUBLISHED,
      price: 2800000000,
      currency: 'IDR',
      bedrooms: 3,
      bathrooms: 3,
      areaSqm: 180,
      address: 'Jl. Raya Lontar',
      city: 'Surabaya',
      latitude: -7.2575,
      longitude: 112.7521,
      isFeatured: false,
      propertyType: savedTypes['house'],
      images: [
        { url: 'https://placehold.co/800x600?text=Townhouse+Surabaya', alt: 'Exterior', isCover: true, sortOrder: 0 },
      ],
    },
  ];

  for (const sample of samples) {
    const existing = await propertyRepo.findOne({ where: { slug: sample.slug } });
    if (existing) {
      console.log(`⏩ Property already exists: ${sample.slug}`);
      continue;
    }

    const { images, ...propertyData } = sample;
    const property = await propertyRepo.save(propertyRepo.create(propertyData));

    for (const img of images) {
      await imageRepo.save(imageRepo.create({ ...img, propertyId: property.id }));
    }
    console.log(`✅ Property seeded: ${sample.title}`);
  }

  await AppDataSource.destroy();
  console.log('✅ Seed complete');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
