import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RecognizeType {
  IMAGE = 'image',
  KEYWORD = 'keyword',
  URL = 'url',
}

export class RecognizeDto {
  @ApiProperty({ enum: RecognizeType })
  @IsEnum(RecognizeType)
  type: RecognizeType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CompareDto {
  @ApiProperty({ description: '商品名称' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: '要比较的平台', isArray: true })
  @IsArray()
  platforms: string[];
}
