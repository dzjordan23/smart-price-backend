import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  MaxFileSizeValidator,
  ParseFilePipe,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { OcrService } from '../../common/services/ocr.service';

class OcrRecognizeDto {
  /** 图片 URL（与 imageFile 二选一） */
  imageUrl?: string;
}

@ApiTags('OCR识别')
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  /**
   * 通过图片 URL 进行商品识别
   */
  @Post('recognize-url')
  @HttpCode(200)
  @ApiOperation({ summary: '通过图片URL识别商品' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: '图片URL' },
      },
    },
  })
  async recognizeByUrl(@Body() body: OcrRecognizeDto) {
    if (!body.imageUrl) {
      throw new BadRequestException('必须提供 imageUrl');
    }

    const result = await this.ocrService.recognizeProduct({
      imageUrl: body.imageUrl,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * 上传图片进行商品识别
   * 支持 jpg、png 格式，最大 5MB
   */
  @Post('recognize-upload')
  @HttpCode(200)
  @ApiOperation({ summary: '上传图片识别商品' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageFile: {
          type: 'string',
          format: 'binary',
          description: '商品图片文件（jpg/png，最大5MB）',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('imageFile'))
  async recognizeByUpload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('必须上传图片文件');
    }

    // 转换为 Base64
    const base64 = file.buffer.toString('base64');

    const result = await this.ocrService.recognizeProduct({
      imageBase64: base64,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * 通用文字识别
   */
  @Post('text')
  @HttpCode(200)
  @ApiOperation({ summary: '通用文字识别' })
  async recognizeText(@Body() body: OcrRecognizeDto) {
    if (!body.imageUrl) {
      throw new BadRequestException('必须提供 imageUrl');
    }

    const text = await this.ocrService.recognizeText(body.imageUrl);

    return {
      success: true,
      data: { text },
    };
  }

  /**
   * 健康检查
   */
  @Post('health')
  @ApiOperation({ summary: 'OCR服务健康检查' })
  health() {
    return {
      status: 'ok',
      service: 'Tencent Cloud OCR',
      timestamp: new Date().toISOString(),
    };
  }
}
