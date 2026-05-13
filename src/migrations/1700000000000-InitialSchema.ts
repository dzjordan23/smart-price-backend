import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建用户表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`openid\` VARCHAR(64) NULL,
        \`unionid\` VARCHAR(64) NULL,
        \`nickname\` VARCHAR(50) NULL,
        \`avatar_url\` VARCHAR(255) NULL,
        \`phone\` VARCHAR(20) NULL,
        \`role\` TINYINT NOT NULL DEFAULT 0 COMMENT '0:普通用户 1:VIP',
        \`vip_expire_at\` DATETIME NULL,
        \`commission_balance\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`total_commission\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '0:禁用 1:正常',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_users_openid\` (\`openid\`),
        INDEX \`idx_users_phone\` (\`phone\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建分类表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`parent_id\` INT NOT NULL DEFAULT 0,
        \`name\` VARCHAR(50) NOT NULL,
        \`icon\` VARCHAR(100) NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建商品表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`name\` VARCHAR(200) NOT NULL,
        \`brand\` VARCHAR(50) NULL,
        \`category_id\` INT NULL,
        \`spec_desc\` VARCHAR(500) NULL,
        \`image_url\` VARCHAR(500) NULL,
        \`source_type\` TINYINT NOT NULL COMMENT '1:手动 2:OCR 3:链接',
        \`source_url\` VARCHAR(500) NULL,
        \`standard_name\` VARCHAR(200) NULL,
        \`status\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_products_user_id\` (\`user_id\`),
        INDEX \`idx_products_category_id\` (\`category_id\`),
        INDEX \`idx_products_standard_name\` (\`standard_name\`),
        FULLTEXT INDEX \`idx_products_name_fulltext\` (\`name\`),
        FULLTEXT INDEX \`idx_products_standard_name_fulltext\` (\`standard_name\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_products_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建商品价格表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`product_prices\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`product_id\` BIGINT NOT NULL,
        \`platform\` VARCHAR(20) NOT NULL,
        \`platform_name\` VARCHAR(200) NULL,
        \`original_price\` DECIMAL(10,2) NULL,
        \`sale_price\` DECIMAL(10,2) NULL,
        \`final_price\` DECIMAL(10,2) NOT NULL,
        \`coupon_info\` JSON NULL,
        \`promotion_info\` JSON NULL,
        \`shop_name\` VARCHAR(100) NULL,
        \`product_url\` VARCHAR(500) NULL,
        \`is_available\` TINYINT NOT NULL DEFAULT 1,
        \`crawled_at\` DATETIME NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_product_prices_product_id\` (\`product_id\`),
        INDEX \`idx_product_prices_platform\` (\`platform\`),
        INDEX \`idx_product_prices_final_price\` (\`final_price\`),
        INDEX \`idx_product_prices_crawled_at\` (\`crawled_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_product_prices_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建降价提醒表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`price_watches\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`product_id\` BIGINT NOT NULL,
        \`target_price\` DECIMAL(10,2) NOT NULL,
        \`platforms\` JSON NULL,
        \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '1:监控中 0:已停止',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_price_watches_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_price_watches_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建购买记录表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`purchase_records\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`product_id\` BIGINT NOT NULL,
        \`price_id\` BIGINT NULL,
        \`platform\` VARCHAR(20) NOT NULL,
        \`commission_rate\` DECIMAL(5,4) NOT NULL,
        \`commission_amount\` DECIMAL(10,2) NOT NULL,
        \`order_no\` VARCHAR(64) NULL,
        \`status\` TINYINT NOT NULL DEFAULT 0 COMMENT '0:待确认 1:已确认 2:已结算 3:已失效',
        \`confirmed_at\` DATETIME NULL,
        \`settled_at\` DATETIME NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_purchase_records_user_id\` (\`user_id\`),
        INDEX \`idx_purchase_records_product_id\` (\`product_id\`),
        INDEX \`idx_purchase_records_status\` (\`status\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_purchase_records_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建论坛帖子表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`forum_posts\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`title\` VARCHAR(200) NOT NULL,
        \`content\` TEXT NOT NULL,
        \`image_urls\` JSON NULL,
        \`like_count\` INT NOT NULL DEFAULT 0,
        \`comment_count\` INT NOT NULL DEFAULT 0,
        \`view_count\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '1:正常 0:删除',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_forum_posts_user_id\` (\`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_forum_posts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建帖子评论表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`post_comments\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`post_id\` BIGINT NOT NULL,
        \`user_id\` BIGINT NOT NULL,
        \`parent_id\` BIGINT NOT NULL DEFAULT 0 COMMENT '父评论ID，0为顶级评论',
        \`content\` TEXT NOT NULL,
        \`like_count\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_post_comments_post_id\` (\`post_id\`),
        INDEX \`idx_post_comments_user_id\` (\`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_post_comments_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`forum_posts\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_post_comments_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建帖子点赞表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`post_likes\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`post_id\` BIGINT NOT NULL,
        \`user_id\` BIGINT NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_post_likes_post_id\` (\`post_id\`),
        INDEX \`idx_post_likes_user_id\` (\`user_id\`),
        UNIQUE INDEX \`idx_post_likes_unique\` (\`post_id\`, \`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_post_likes_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`forum_posts\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_post_likes_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建好物推荐表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`product_recommends\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`product_name\` VARCHAR(200) NOT NULL,
        \`product_url\` VARCHAR(500) NULL,
        \`image_url\` VARCHAR(500) NULL,
        \`price\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`reason\` TEXT NOT NULL,
        \`like_count\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_product_recommends_user_id\` (\`user_id\`),
        INDEX \`idx_product_recommends_product_name\` (\`product_name\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_product_recommends_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建二手转售表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resale_items\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`product_name\` VARCHAR(200) NOT NULL,
        \`product_url\` VARCHAR(500) NULL,
        \`image_urls\` JSON NULL,
        \`original_price\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`sale_price\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`condition\` VARCHAR(50) NOT NULL COMMENT '新旧程度描述',
        \`description\` TEXT NULL,
        \`view_count\` INT NOT NULL DEFAULT 0,
        \`like_count\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '1:出售中 2:已售出 0:已下架',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_resale_items_user_id\` (\`user_id\`),
        INDEX \`idx_resale_items_product_name\` (\`product_name\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_resale_items_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建评价晒单表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`product_reviews\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`product_id\` BIGINT NULL,
        \`product_name\` VARCHAR(200) NOT NULL,
        \`platform\` VARCHAR(20) NULL,
        \`rating\` TINYINT NOT NULL DEFAULT 5,
        \`content\` TEXT NOT NULL,
        \`image_urls\` JSON NULL,
        \`like_count\` INT NOT NULL DEFAULT 0,
        \`status\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_product_reviews_user_id\` (\`user_id\`),
        INDEX \`idx_product_reviews_product_id\` (\`product_id\`),
        INDEX \`idx_product_reviews_product_name\` (\`product_name\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_product_reviews_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[Migration] Initial schema created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除所有表（按依赖顺序）
    await queryRunner.query('DROP TABLE IF EXISTS `product_reviews`');
    await queryRunner.query('DROP TABLE IF EXISTS `resale_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_recommends`');
    await queryRunner.query('DROP TABLE IF EXISTS `post_likes`');
    await queryRunner.query('DROP TABLE IF EXISTS `post_comments`');
    await queryRunner.query('DROP TABLE IF EXISTS `forum_posts`');
    await queryRunner.query('DROP TABLE IF EXISTS `purchase_records`');
    await queryRunner.query('DROP TABLE IF EXISTS `price_watches`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_prices`');
    await queryRunner.query('DROP TABLE IF EXISTS `products`');
    await queryRunner.query('DROP TABLE IF EXISTS `categories`');
    await queryRunner.query('DROP TABLE IF EXISTS `users`');

    console.log('[Migration] Initial schema dropped successfully');
  }
}
