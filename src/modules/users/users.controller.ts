import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './enums/user-role.enum';
import { UsersService } from './users.service';
import { UsersMapper } from './users.mapper';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('admin / users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class UsersAdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersMapper: UsersMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all admin/editor users' })
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map((user) => this.usersMapper.toDto(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findByIdOrFail(id, {
      withPhoto: true,
    });
    return this.usersMapper.toDto(user);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a new admin or editor user (requires existing admin token)',
  })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.createUser(dto);
    return this.usersMapper.toDto(user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update user name, role, active status, or password',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.updateUser(id, dto);
    return this.usersMapper.toDto(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (cannot delete your own account)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: User,
  ) {
    if (id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.usersService.removeUser(id);
  }

  @Post(':id/photo')
  @ApiOperation({
    summary: 'Upload/replace the agent photo shown on property detail pages',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, or WebP, max 20 MB)',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async setPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.usersService.setPhoto(id, file);
    return this.usersMapper.toDto(user);
  }
}
