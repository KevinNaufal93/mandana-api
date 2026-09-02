import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MediaService } from '../media/media.service';
import { MediaPurpose } from '../media/enums/media-purpose.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mediaService: MediaService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * `withPhoto` loads the `photoMediaAsset` relation so a response can be
   * run through UsersMapper. Defaults to off because this method is also
   * every JWT strategy's per-request identity lookup (jwt/jwt-refresh/
   * jwt-stream .strategy.ts) — those never render a photo, so they
   * shouldn't pay for the join on every authenticated request.
   */
  findById(
    id: string,
    opts: { withPhoto?: boolean } = {},
  ): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: opts.withPhoto ? { photoMediaAsset: true } : undefined,
    });
  }

  async findByIdOrFail(
    id: string,
    opts: { withPhoto?: boolean } = {},
  ): Promise<User> {
    const user = await this.findById(id, opts);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async updateRefreshToken(id: string, hashedRefreshToken: string | null) {
    await this.usersRepository.update(id, { hashedRefreshToken });
  }

  // ─── Admin methods ────────────────────────────────────────────────────────

  findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
      relations: { photoMediaAsset: true },
    });
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing)
      throw new ConflictException(`Email '${dto.email}' is already in use`);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: dto.role,
      title: dto.title ?? null,
      phone: dto.phone ?? null,
      whatsapp: dto.whatsapp ?? null,
    });
    return this.usersRepository.save(user);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findByIdOrFail(id, { withPhoto: true });

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password !== undefined) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.title !== undefined) user.title = dto.title ?? null;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.whatsapp !== undefined) user.whatsapp = dto.whatsapp ?? null;

    return this.usersRepository.save(user);
  }

  async removeUser(id: string): Promise<void> {
    const user = await this.findByIdOrFail(id);
    await this.usersRepository.remove(user);
  }

  async setPhoto(id: string, file: Express.Multer.File): Promise<User> {
    const user = await this.findByIdOrFail(id);
    const asset = await this.mediaService.upload(file, {
      purpose: MediaPurpose.COVER,
      alt: user.name,
    });
    user.photoMediaAssetId = asset.id;
    // Also set the relation object itself (not just its FK column) so the
    // saved-and-returned `user` already carries a renderable photo for
    // UsersMapper — cheaper than a second findById(..., {withPhoto:true})
    // round-trip, and correct: no `cascade` on this relation, so save()
    // persists via photoMediaAssetId only and never re-writes `asset`.
    user.photoMediaAsset = asset;
    return this.usersRepository.save(user);
  }
}
