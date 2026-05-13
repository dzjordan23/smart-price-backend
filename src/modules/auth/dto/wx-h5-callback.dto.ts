import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WxH5CallbackDto {
  @ApiProperty({ description: '微信授权后返回的 code' })
  @IsString()
  code: string;

  @ApiProperty({ description: '自定义状态码', required: false })
  @IsOptional()
  @IsString()
  state?: string;
}
