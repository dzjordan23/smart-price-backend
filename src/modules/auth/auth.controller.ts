import { Controller, Post, Get, Body, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
import { WxH5CallbackDto } from './dto/wx-h5-callback.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '微信小程序登录' })
  async login(@Body() dto: WxLoginDto) {
    return this.authService.wxLogin(dto);
  }

  /**
   * 获取微信网页授权 URL
   * 前端在微信浏览器中调用此接口获取授权链接，然后跳转到该链接
   */
  @Get('wx/authorize-url')
  @ApiOperation({ summary: '获取微信网页授权URL' })
  @ApiQuery({ name: 'redirectUri', description: '授权后跳转的回调地址', required: true })
  @ApiQuery({ name: 'state', description: '自定义状态码，用于防止CSRF', required: false })
  @ApiResponse({ status: 200, description: '返回微信授权URL' })
  async getAuthorizeUrl(
    @Query('redirectUri') redirectUri: string,
    @Query('state') state?: string,
  ) {
    const url = await this.authService.getWxAuthorizeUrl(redirectUri, state);
    return { url };
  }

  /**
   * 微信网页授权回调
   * 微信授权后会回调此接口，换取用户信息并生成 JWT
   */
  @Get('wx/callback')
  @HttpCode(200)
  @ApiOperation({ summary: '微信网页授权回调' })
  async wxCallback(@Query() query: WxH5CallbackDto) {
    return this.authService.handleWxH5Callback(query.code, query.state);
  }

  /**
   * 微信内静默授权（获取 openid）
   * 适用于只需要识别用户身份的简单场景
   */
  @Get('wx/silent-authorize')
  @ApiOperation({ summary: '微信静默授权' })
  @ApiQuery({ name: 'redirectUri', description: '授权后跳转的回调地址', required: true })
  async getSilentAuthorizeUrl(@Query('redirectUri') redirectUri: string) {
    const url = await this.authService.getWxSilentAuthorizeUrl(redirectUri);
    return { url };
  }

  /**
   * 刷新 AccessToken
   */
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '刷新JWT Token' })
  async refreshToken(@Body() body: { token: string }) {
    return this.authService.refreshToken(body.token);
  }
}
