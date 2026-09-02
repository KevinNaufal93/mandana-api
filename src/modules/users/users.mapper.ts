import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { MediaService, MediaImageDto } from '../media/media.service';

/**
 * Response shape for every /admin/users endpoint. Additive over the old
 * hand-serialized entity (see git history) — `photoMediaAssetId` stays for
 * back-compat with existing consumers (docs/callers that only check
 * presence), `photo` is new: the same `{url, srcset, ...}` shape
 * properties.agent.photo already sends, built the same way (see
 * property.mapper.ts's `agent` field). null on both a user with no photo
 * AND, per buildImageDto's own contract, a row whose upload half-failed.
 */
export interface UserDto {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  title: string | null;
  phone: string | null;
  whatsapp: string | null;
  photoMediaAssetId: string | null;
  photo: MediaImageDto | null;
}

@Injectable()
export class UsersMapper {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Requires `user.photoMediaAsset` to already be loaded (relation query,
   * or set in memory right after an upload) whenever `photoMediaAssetId`
   * is non-null — callers that skip that (the hot JWT-strategy read path)
   * must not route their result through this mapper. See
   * UsersService.findById's `withPhoto` option.
   */
  toDto(user: User): UserDto {
    return {
      id: user.id,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      title: user.title,
      phone: user.phone,
      whatsapp: user.whatsapp,
      photoMediaAssetId: user.photoMediaAssetId,
      photo: user.photoMediaAsset
        ? this.mediaService.buildImageDto(user.photoMediaAsset)
        : null,
    };
  }
}
