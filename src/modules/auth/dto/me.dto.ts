import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/users.mapper';
import { UserRole } from '../../users/enums/user-role.enum';
import { MediaImageDto } from '../../media/media.service';
import { AccessModule } from '../../../common/enums/access-module.enum';

/**
 * GET /auth/me's response shape only — additive over UserDto (used by every
 * /admin/users route) with the caller's own granted modules, so the admin
 * panel can filter its sidebar and gate pages without a second round trip.
 * Deliberately NOT folded into UserDto/UsersMapper: on the /admin/users
 * list, "modules" would describe someone else's grants and cost a lookup
 * per row for a field nothing there reads.
 */
export class MeDto implements UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) whatsapp!: string | null;
  @ApiProperty({ nullable: true, type: String })
  photoMediaAssetId!: string | null;
  @ApiProperty({ nullable: true, type: Object }) photo!: MediaImageDto | null;

  @ApiProperty({
    enum: AccessModule,
    isArray: true,
    description:
      "The caller's currently granted modules (union of their role's " +
      'grants and always-on modules; full catalog for admin).',
  })
  modules!: AccessModule[];
}
