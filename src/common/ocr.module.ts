import { Module } from '@nestjs/common';
import { OcrService } from './services/ocr.service';

@Module({
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
