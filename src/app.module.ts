import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

import {
  appConfig,
  jwtConfig,
  dbConfig,
  redisConfig,
  mongoConfig,
  wechatConfig,
  tencentConfig,
  crawlerConfig,
} from './config';

import { User } from './database/entities/user.entity';
import { Product, Category } from './database/entities/product.entity';
import { ProductPrice, PriceWatch } from './database/entities/price.entity';
import { PurchaseRecord } from './database/entities/purchase.entity';
import {
  ForumPost,
  PostComment,
  PostLike,
  ProductRecommend,
  ResaleItem,
  ProductReview,
} from './database/entities/community.entity';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { PriceModule } from './modules/price/price.module';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { NotificationModule } from './modules/notification/notification.module';
import { CommunityModule } from './modules/community/community.module';
import { RedisModule } from './modules/redis/redis.module';
import { CompareModule } from './modules/compare/compare.module';
import { ScheduledTasksModule } from './common/scheduled-tasks.module';
import { OcrModule } from './modules/ocr/ocr.module';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' };
  }
}

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        jwtConfig,
        dbConfig,
        redisConfig,
        mongoConfig,
        wechatConfig,
        tencentConfig,
        crawlerConfig,
      ],
    }),

    // 限流
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 60 }, // 60次/分钟
    ]),

    // MySQL —— 支持 DATABASE_URL / Railway MYSQLHOST* / 自定义 DB_* / 本地默认值
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get('database') as any;
        const app = config.get('app') as any;
        const host = db.host;
        const port = db.port;
        const nodeEnv = app.nodeEnv || process.env.NODE_ENV || 'development';
        const isProduction = nodeEnv === 'production';

        console.log(`[DB] Connecting to ${host}:${port}, database=${db.database}, user=${db.username}`);
        console.log(`[DB] Environment: ${nodeEnv}, synchronize: ${!isProduction}`);

        const opts: Record<string, any> = {
          type: 'mysql',
          host,
          port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: [
            User, Product, Category,
            ProductPrice, PriceWatch, PurchaseRecord,
            ForumPost, PostComment, PostLike,
            ProductRecommend, ResaleItem, ProductReview,
          ],
          // ⚠️ 生产环境必须关闭 synchronize，使用 Migration
          synchronize: !isProduction,
          // 生产环境启用 Migration
          migrations: isProduction ? ['dist/migrations/*.js'] : [],
          migrationsRun: isProduction,
          migrationsTransactionMode: 'each',
          charset: 'utf8mb4',
          timezone: '+08:00',
          // 日志配置
          logging: isProduction ? ['error', 'warn'] : ['query', 'error', 'warn', 'info'],
          logger: 'advanced-console',
        };

        // 如果有完整 URL（DATABASE_URL），直接用 url 连接
        if (db.url) {
          opts.url = db.url;
          delete opts.host;
          delete opts.port;
          delete opts.username;
          delete opts.password;
          delete opts.database;
          opts.ssl = { rejectUnauthorized: false };
        }

        // Railway 内网连接不需要 SSL
        if (host && (host.includes('.railway.app') || host.includes('.railway.internal'))) {
          delete opts.ssl;
        }

        // 生产环境额外配置
        if (isProduction) {
          opts.extra = {
            connectionLimit: 10,
            waitForConnections: true,
            queueLimit: 0,
          };
        }

        return opts;
      },
    }),

    // MongoDB 已禁用（Railway 免费账号限制，后续可通过 Atlas 接入）
    // MongooseModule.forRootAsync({ ... }),

    // Redis（全局模块，提供任务状态缓存）
    RedisModule,

    // Bull 任务队列
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get('redis') as any;
        return {
          redis: {
            host: redis.host || 'localhost',
            port: redis.port || 6379,
            password: redis.password || undefined,
            db: redis.db || 1, // 使用独立的 db 避免与缓存冲突
          },
          defaultJobOptions: {
            removeOnComplete: 100, // 完成后保留100条记录
            removeOnFail: 200, // 失败后保留200条记录
            attempts: 3, // 默认重试3次
            backoff: {
              type: 'exponential',
              delay: 2000, // 指数退避初始延迟2秒
            },
          },
        };
      },
    }),

    // 定时任务调度
    ScheduleModule.forRoot(),

    // 业务模块
    AuthModule,
    UserModule,
    ProductModule,
    PriceModule,
    CrawlerModule,
    NotificationModule,
    CommunityModule,
    CompareModule,
    ScheduledTasksModule,
    OcrModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
