import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';

@ApiTags('社群互动')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ─── 论坛帖子 ────────────────────────────────────────────────────────────

  @Get('posts')
  @ApiOperation({ summary: '获取帖子列表' })
  getPosts(
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
    @Query('keyword') keyword?: string,
  ) {
    return this.communityService.getPosts(+page, +pageSize, keyword);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '获取帖子详情' })
  getPost(@Param('id') id: number) {
    return this.communityService.getPostById(+id);
  }

  @Post('posts')
  @ApiOperation({ summary: '发布帖子' })
  createPost(@CurrentUser() user: User, @Body() body: { title: string; content: string; imageUrls?: string[] }) {
    return this.communityService.createPost(user.id, body);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: '删除帖子' })
  deletePost(@CurrentUser() user: User, @Param('id') id: number) {
    return this.communityService.deletePost(user.id, +id);
  }

  // ─── 帖子评论 ────────────────────────────────────────────────────────────

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: '获取帖子评论' })
  getComments(
    @Param('postId') postId: number,
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
  ) {
    return this.communityService.getComments(+postId, +page, +pageSize);
  }

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: '发表评论' })
  createComment(
    @CurrentUser() user: User,
    @Param('postId') postId: number,
    @Body() body: { content: string; parentId?: number },
  ) {
    return this.communityService.createComment(user.id, +postId, body);
  }

  @Post('posts/:postId/like')
  @ApiOperation({ summary: '点赞帖子' })
  likePost(@CurrentUser() user: User, @Param('postId') postId: number) {
    return this.communityService.likePost(user.id, +postId);
  }

  // ─── 好物推荐 ────────────────────────────────────────────────────────────

  @Get('recommendations')
  @ApiOperation({ summary: '获取好物推荐列表' })
  getRecommendations(
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
    @Query('keyword') keyword?: string,
  ) {
    return this.communityService.getRecommendations(+page, +pageSize, keyword);
  }

  @Post('recommendations')
  @ApiOperation({ summary: '发布好物推荐' })
  createRecommendation(
    @CurrentUser() user: User,
    @Body()
    body: {
      productName: string;
      productUrl?: string;
      imageUrl?: string;
      price?: number;
      reason: string;
    },
  ) {
    return this.communityService.createRecommendation(user.id, body);
  }

  @Post('recommendations/:id/like')
  @ApiOperation({ summary: '点赞推荐' })
  likeRecommendation(@CurrentUser() user: User, @Param('id') id: number) {
    return this.communityService.likeRecommendation(user.id, +id);
  }

  // ─── 二手转售 ────────────────────────────────────────────────────────────

  @Get('resale')
  @ApiOperation({ summary: '获取二手转售列表' })
  getResaleItems(
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
    @Query('keyword') keyword?: string,
  ) {
    return this.communityService.getResaleItems(+page, +pageSize, keyword);
  }

  @Post('resale')
  @ApiOperation({ summary: '发布二手商品' })
  createResaleItem(
    @CurrentUser() user: User,
    @Body()
    body: {
      productName: string;
      productUrl?: string;
      imageUrls?: string[];
      originalPrice?: number;
      salePrice: number;
      condition: string;
      description?: string;
    },
  ) {
    return this.communityService.createResaleItem(user.id, body);
  }

  @Put('resale/:id/status')
  @ApiOperation({ summary: '更新二手商品状态' })
  updateResaleStatus(
    @CurrentUser() user: User,
    @Param('id') id: number,
    @Body() body: { status: number },
  ) {
    return this.communityService.updateResaleItem(user.id, +id, body.status);
  }

  // ─── 评价晒单 ────────────────────────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: '获取评价晒单列表' })
  getReviews(
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
    @Query('keyword') keyword?: string,
    @Query('platform') platform?: string,
  ) {
    return this.communityService.getReviews(+page, +pageSize, keyword, platform);
  }

  @Post('reviews')
  @ApiOperation({ summary: '发布评价晒单' })
  createReview(
    @CurrentUser() user: User,
    @Body()
    body: {
      productId?: number;
      productName: string;
      platform?: string;
      rating: number;
      content: string;
      imageUrls?: string[];
    },
  ) {
    return this.communityService.createReview(user.id, body);
  }

  @Post('reviews/:id/like')
  @ApiOperation({ summary: '点赞评价' })
  likeReview(@CurrentUser() user: User, @Param('id') id: number) {
    return this.communityService.likeReview(user.id, +id);
  }
}
