import { IsString, IsOptional, IsArray, IsEnum, IsNumber } from 'class-validator';
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
  @ApiProperty({ description: '商品名称/关键词', required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ description: '商品名称（兼容旧字段）', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '品牌', required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ description: '规格描述', required: false })
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiProperty({ description: '商品图片URL', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: '商品ID（已有商品时使用）', required: false })
  @IsOptional()
  @IsNumber()
  productId?: number;

  @ApiProperty({ description: '要比较的平台', isArray: true, required: false })
  @IsOptional()
  @IsArray()
  platforms?: string[];
}
