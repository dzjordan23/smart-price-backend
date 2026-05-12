import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  // 先打日志确认启动入口（方便 Railway 部署排查）
  console.log('[bootstrap] Starting SmartPrice backend...');
  console.log(`[bootstrap] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[bootstrap] PORT=${process.env.PORT}`);
  console.log(`[bootstrap] DATABASE_URL=${process.env.DATABASE_URL ? '***set***' : 'undefined'}`);
  console.log(`[bootstrap] REDIS_URL=${process.env.REDIS_URL ? '***set***' : 'undefined'}`);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  // 端口：优先 Railway/Render 等平台注入的 PORT
  const port = parseInt(process.env['PORT'] ?? '', 10) || configService.get<number>('app.port') || 3000;
  const nodeEnv = configService.get<string>('app.nodeEnv');

  // 全局前缀
  app.setGlobalPrefix('v1');

  // CORS
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Version'],
  });

  // 全局管道：参数校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger 文档（仅非生产环境）
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('智选比价助手 API')
      .setDescription('SmartPrice API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
    Logger.log(`Swagger: http://localhost:${port}/api-docs`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(`🚀 服务启动成功: http://localhost:${port}/v1`, 'Bootstrap');
  Logger.log(`环境: ${nodeEnv}`, 'Bootstrap');
}

bootstrap();
