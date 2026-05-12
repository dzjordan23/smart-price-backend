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

export const dbConfig = registerAs('database', () => {
  // 优先级1: DATABASE_URL（Railway/Render/Heroku 通用）
  // 优先级2: Railway MySQL 插件独立变量（MYSQLHOST, MYSQLPORT, MYSQLUSER...）
  // 优先级3: 自定义变量（DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE）
  // 优先级4: 本地开发默认值

  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl) {
    // 把 URL 拆成独立字段，TypeORM 的 url 参数有时有兼容问题
    try {
      const u = new URL(databaseUrl);
      return {
        host: u.hostname,
        port: parseInt(u.port ?? '3306', 10) || 3306,
        username: u.username,
        password: u.password,
        database: u.pathname.replace(/^\//, ''),
        url: databaseUrl,
      };
    } catch {
      // URL 解析失败，继续尝试其他变量
    }
  }

  // Railway MySQL 插件注入的独立变量
  const mysqlHost = process.env['MYSQLHOST'] || process.env['MYSQL_HOST'];
  if (mysqlHost) {
    return {
      host: mysqlHost,
      port: parseInt(process.env['MYSQLPORT'] ?? '3306', 10) || (parseInt(process.env['MYSQL_PORT'] ?? '3306', 10) || 3306),
      username: process.env['MYSQLUSER'] || process.env['MYSQL_USER'] || 'root',
      password: process.env['MYSQLPASSWORD'] || process.env['MYSQL_PASSWORD'] || '',
      database: process.env['MYSQLDATABASE'] || process.env['MYSQL_DATABASE'] || 'smart_price',
    };
  }

  // 自定义变量 → 本地开发默认值
  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] ?? '3306', 10) || 3306,
    username: process.env['DB_USERNAME'] || 'root',
    password: process.env['DB_PASSWORD'] || '',
    database: process.env['DB_DATABASE'] || 'smart_price',
  };
});

export const redisConfig = registerAs('redis', () => {
  // 支持 Railway 自动注入的 REDIS_URL
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port ?? '6379', 10) || 6379,
        password: url.password || undefined,
      };
    } catch {
      // URL 解析失败，继续走独立变量
    }
  }
  return {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10) || 6379,
    password: process.env['REDIS_PASSWORD'] || undefined,
  };
});

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
