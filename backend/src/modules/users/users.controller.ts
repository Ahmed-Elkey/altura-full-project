import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CookieResponse, RefreshCookieService } from '../../common/security/refresh-cookie.service';
import { AddressesService } from './addresses.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly addressesService: AddressesService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.usersService.changePassword(user.id, dto);
    this.refreshCookie.clear(response);
  }

  @Get('addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.addressesService.list(user.id);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.id, dto);
  }

  @Get('addresses/:addressId')
  address(@CurrentUser() user: AuthUser, @Param('addressId') addressId: string) {
    return this.addressesService.get(user.id, addressId);
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.id, addressId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('addresses/:addressId')
  async removeAddress(
    @CurrentUser() user: AuthUser,
    @Param('addressId') addressId: string,
  ): Promise<void> {
    await this.addressesService.remove(user.id, addressId);
  }
}
