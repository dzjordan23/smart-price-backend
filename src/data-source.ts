import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

// 加载环境变量
config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'smart_price',
  entities: ['src/database/entities/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : true,
  charset: 'utf8mb4',
  timezone: '+08:00',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
