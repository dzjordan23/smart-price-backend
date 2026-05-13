import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { User } from '../../database/entities/user.entity';
import { WxLoginDto } from './dto/wx-login.dto';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
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

  /**
   * 获取微信网页授权 URL（snsapi_userinfo - 需要用户授权）
   */
  async getWxAuthorizeUrl(redirectUri: string, state?: string): Promise<string> {
    const appId = this.configService.get<string>('wechat.appId');

    if (!appId || appId === 'your-wechat-appid') {
      this.logger.warn('未配置微信AppId，返回测试URL');
      return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=test&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_userinfo&state=test#wechat_redirect`;
    }

    // 对回调地址进行 URL 编码
    const encodedRedirectUri = encodeURIComponent(redirectUri);
    const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';

    // 微信授权链接
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=snsapi_userinfo&state=${state || 'STATE'}${stateParam}#wechat_redirect`;
  }

  /**
   * 获取微信静默授权 URL（snsapi_base - 不弹出授权页面）
   */
  async getWxSilentAuthorizeUrl(redirectUri: string): Promise<string> {
    const appId = this.configService.get<string>('wechat.appId');

    if (!appId || appId === 'your-wechat-appid') {
      this.logger.warn('未配置微信AppId，返回测试URL');
      return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=test&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_base&state=slient#wechat_redirect`;
    }

    const encodedRedirectUri = encodeURIComponent(redirectUri);

    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=snsapi_base&state=silent#wechat_redirect`;
  }

  /**
   * 处理微信网页授权回调
   * 使用 code 换取 openid 和用户信息
   */
  async handleWxH5Callback(code: string, state?: string): Promise<{
    token: string;
    expiresIn: number;
    user: any;
  }> {
    const appId = this.configService.get<string>('wechat.appId');
    const secret = this.configService.get<string>('wechat.secret');

    // 开发模式
    if (!appId || appId === 'your-wechat-appid') {
      this.logger.warn('未配置微信AppId，使用测试模式');

      // 创建测试用户
      const testOpenid = `test_h5_${code}`;
      const user = await this.getOrCreateUser(testOpenid, '测试用户', '');

      return {
        token: this.signToken(user),
        expiresIn: 7 * 24 * 3600,
        user: this.formatUser(user),
      };
    }

    // 使用 code 换取 openid（静默授权）
    const openid = await this.getOpenidByCode(code, appId as string, secret as string);

    // 获取用户信息（如果需要）
    const userInfo = await this.getWxUserInfo(openid, appId as string, secret as string);

    // 获取或创建用户
    const user = await this.getOrCreateUser(
      openid,
      userInfo?.nickname || '微信用户',
      userInfo?.headimgurl || '',
    );

    // 生成 JWT
    const token = this.signToken(user);

    return {
      token,
      expiresIn: 7 * 24 * 3600,
      user: this.formatUser(user),
    };
  }

  /**
   * 通过 code 获取 openid
   */
  private async getOpenidByCode(code: string, appId: string, secret: string): Promise<string> {
    const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`;

    try {
      const { data } = await axios.get(url);

      if (data.errcode) {
        throw new UnauthorizedException(`微信授权失败: ${data.errmsg}`);
      }

      return data.openid;
    } catch (error) {
      this.logger.error(`获取 openid 失败: ${error}`);
      throw new UnauthorizedException('微信授权失败');
    }
  }

  /**
   * 获取微信用户信息
   */
  private async getWxUserInfo(openid: string, appId: string, secret: string): Promise<any> {
    try {
      // 需要先获取 access_token
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=&grant_type=client_credential`;
      const { data: tokenData } = await axios.get(tokenUrl);

      if (tokenData.errcode) {
        this.logger.warn(`获取 access_token 失败: ${tokenData.errmsg}`);
        return null;
      }

      // 使用 access_token 获取用户信息
      const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${openid}`;
      const { data: userInfo } = await axios.get(userInfoUrl);

      return userInfo;
    } catch (error) {
      this.logger.warn(`获取用户信息失败: ${error}`);
      return null;
    }
  }

  /**
   * 获取或创建用户
   */
  private async getOrCreateUser(openid: string, nickname: string, avatarUrl: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { openid } });

    if (!user) {
      user = this.userRepo.create({
        openid,
        nickname,
        avatarUrl,
        status: 1,
      });
      user = await this.userRepo.save(user);
      this.logger.log(`新用户注册: openid=${openid}, nickname=${nickname}`);
    } else {
      // 更新用户信息
      if (nickname && nickname !== '微信用户') user.nickname = nickname;
      if (avatarUrl) user.avatarUrl = avatarUrl;
      await this.userRepo.save(user);
    }

    return user;
  }

  /**
   * 刷新 Token
   */
  async refreshToken(oldToken: string): Promise<{
    token: string;
    expiresIn: number;
  }> {
    try {
      // 验证旧 Token
      const payload = this.jwtService.verify(oldToken);
      const user = await this.userRepo.findOne({
        where: { id: payload.sub, status: 1 },
      });

      if (!user) {
        throw new UnauthorizedException('用户不存在或已禁用');
      }

      // 生成新 Token
      const newToken = this.signToken(user);

      return {
        token: newToken,
        expiresIn: 7 * 24 * 3600,
      };
    } catch (error) {
      throw new UnauthorizedException('Token 刷新失败');
    }
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
