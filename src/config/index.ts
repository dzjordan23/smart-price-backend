import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] ?? '3000', 10) || 3000,
  name: process.env['APP_NAME'] || 'SmartPrice',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env['JWT_SECRET'] || 'fallback-secret',
  expiresIn: process.env['JWT_EXPIRES_IN'] || '7d',
}));

export const dbConfig = registerAs('database', () => ({
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '3306', 10) || 3306,
  username: process.env['DB_USERNAME'] || 'root',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_DATABASE'] || 'smart_price',
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10) || 6379,
  password: process.env['REDIS_PASSWORD'] || undefined,
}));

export const mongoConfig = registerAs('mongo', () => ({
  uri: process.env['MONGO_URI'] || 'mongodb://localhost:27017/smart_price',
}));

export const wechatConfig = registerAs('wechat', () => ({
  appId: process.env['WECHAT_APPID'] || '',
  secret: process.env['WECHAT_SECRET'] || '',
}));

export const tencentConfig = registerAs('tencent', () => ({
  secretId: process.env['TENCENT_SECRET_ID'] || '',
  secretKey: process.env['TENCENT_SECRET_KEY'] || '',
  ocrRegion: process.env['TENCENT_OCR_REGION'] || 'ap-guangzhou',
  cosBucket: process.env['COS_BUCKET'] || '',
  cosRegion: process.env['COS_REGION'] || 'ap-guangzhou',
}));

export const crawlerConfig = registerAs('crawler', () => ({
  concurrency: parseInt(process.env['CRAWLER_CONCURRENCY'] ?? '5', 10) || 5,
  intervalMin: parseInt(process.env['CRAWLER_INTERVAL_MIN'] ?? '3000', 10) || 3000,
  intervalMax: parseInt(process.env['CRAWLER_INTERVAL_MAX'] ?? '8000', 10) || 8000,
}));
