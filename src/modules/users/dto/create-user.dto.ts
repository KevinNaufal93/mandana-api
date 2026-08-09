import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'editor@mandana.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Budi Editor' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'Str0ngP@ssword', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.EDITOR })
  @IsEnum(UserRole)
  role: UserRole = UserRole.EDITOR;

  @ApiPropertyOptional({
    example: 'Agen Independen',
    description: 'Public title shown on the agent card',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: '08777123456' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '+628777123456' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;
}
