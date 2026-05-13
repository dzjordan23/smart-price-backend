import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import {
  ForumPost,
  PostComment,
  PostLike,
  ProductRecommend,
  ResaleItem,
  ProductReview,
} from '../../database/entities/community.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ForumPost,
      PostComment,
      PostLike,
      ProductRecommend,
      ResaleItem,
      ProductReview,
    ]),
  ],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
