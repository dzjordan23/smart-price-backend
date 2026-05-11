import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { User } from '../../database/entities/user.entity';
import { WxLoginDto } from './dto/wx-login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async wxLogin(dto: WxLoginDto) {
    const { openid } = await this.getWxOpenid(dto.code);

    let user = await this.userRepo.findOne({ where: { openid } });
    if (!user) {
      user = this.userRepo.create({
        openid,
        nickname: dto.nickname || '比价用户',
        avatarUrl: dto.avatarUrl || '',
        status: 1,
      });
      user = await this.userRepo.save(user);
      this.logger.log(`新用户注册: openid=${openid}`);
    } else {
      // 更新用户信息
      if (dto.nickname) user.nickname = dto.nickname;
      if (dto.avatarUrl) user.avatarUrl = dto.avatarUrl;
      await this.userRepo.save(user);
    }

    const token = this.signToken(user);
    return {
      token,
      expiresIn: 7 * 24 * 3600,
      user: this.formatUser(user),
    };
  }

  private async getWxOpenid(code: string): Promise<{ openid: string }> {
    const appId = this.configService.get<string>('wechat.appId');
    const secret = this.configService.get<string>('wechat.secret');

    // 开发模式：如果没配置微信，返回测试 openid
    if (!appId || appId === 'your-wechat-appid') {
      this.logger.warn('未配置微信AppId，使用测试模式');
      return { openid: `test_${code}` };
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const { data } = await axios.get(url);

    if (data.errcode) {
      throw new UnauthorizedException(`微信登录失败: ${data.errmsg}`);
    }
    return { openid: data.openid };
  }

  signToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      openid: user.openid,
      role: user.role,
    });
  }

  async validateUser(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId, status: 1 },
    });
    if (!user) throw new UnauthorizedException('用户不存在或已禁用');
    return user;
  }

  private formatUser(user: User) {
    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      isVip: user.role === 1,
      vipExpireAt: user.vipExpireAt,
      commissionBalance: Number(user.commissionBalance),
    };
  }
}
