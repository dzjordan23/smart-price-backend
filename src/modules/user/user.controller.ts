import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';

@ApiTags('用户')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取个人信息' })
  getProfile(@CurrentUser() user: User) {
    return this.userService.getProfile(user.id);
  }

  @Get('commissions')
  @ApiOperation({ summary: '返利记录' })
  getCommissions(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
  ) {
    return this.userService.getCommissions(user.id, +page, +pageSize);
  }
}
