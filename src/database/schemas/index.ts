import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductSnapshotDocument = ProductSnapshot & Document;

@Schema({ collection: 'product_snapshots', timestamps: true })
export class ProductSnapshot {
  @Prop({ required: true, index: true })
  productId: number;

  @Prop({ required: true, index: true })
  platform: string;

  @Prop({ type: Array, default: [] })
  snapshots: {
    price: number;
    finalPrice: number;
    couponInfo?: object;
    crawledAt: Date;
  }[];
}

export const ProductSnapshotSchema =
  SchemaFactory.createForClass(ProductSnapshot);

// ───────────────────────────────────────────────

export type CrawlerLogDocument = CrawlerLog & Document;

@Schema({ collection: 'crawler_logs', timestamps: true })
export class CrawlerLog {
  @Prop({ required: true })
  taskId: string;

  @Prop({ required: true, index: true })
  platform: string;

  @Prop()
  url: string;

  @Prop({ index: true })
  status: string; // 'success' | 'failed' | 'timeout'

  @Prop()
  durationMs: number;

  @Prop()
  proxyUsed: string;

  @Prop()
  errorMessage: string;

  @Prop({ type: Object })
  rawData: object;
}

export const CrawlerLogSchema = SchemaFactory.createForClass(CrawlerLog);
// TTL index: auto-delete logs after 30 days
CrawlerLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
