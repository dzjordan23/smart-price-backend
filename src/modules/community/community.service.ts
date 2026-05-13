import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import {
  ForumPost,
  PostComment,
  PostLike,
  ProductRecommend,
  ResaleItem,
  ProductReview,
} from '../../database/entities/community.entity';

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(ForumPost)
    private readonly postRepo: Repository<ForumPost>,
    @InjectRepository(PostComment)
    private readonly commentRepo: Repository<PostComment>,
    @InjectRepository(PostLike)
    private readonly likeRepo: Repository<PostLike>,
    @InjectRepository(ProductRecommend)
    private readonly recommendRepo: Repository<ProductRecommend>,
    @InjectRepository(ResaleItem)
    private readonly resaleRepo: Repository<ResaleItem>,
    @InjectRepository(ProductReview)
    private readonly reviewRepo: Repository<ProductReview>,
  ) {}

  // ─── 论坛帖子 ────────────────────────────────────────────────────────────

  async getPosts(page = 1, pageSize = 20, keyword?: string) {
    const whereCondition = keyword
      ? [
          { title: Like(`%${keyword}%`), status: 1 },
          { content: Like(`%${keyword}%`), status: 1 },
        ]
      : { status: 1 };

    const [list, total] = await this.postRepo.findAndCount({
      where: whereCondition,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 增加浏览量
    for (const post of list) {
      await this.postRepo.update(post.id, { viewCount: post.viewCount + 1 });
    }

    return {
      list: list.map((p) => this.formatPost(p)),
      total,
      page,
      pageSize,
    };
  }

  async getPostById(id: number) {
    const post = await this.postRepo.findOne({
      where: { id, status: 1 },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    // 增加浏览量
    await this.postRepo.update(id, { viewCount: post.viewCount + 1 });

    return this.formatPost(post);
  }

  async createPost(userId: number, data: { title: string; content: string; imageUrls?: string[] }) {
    const post = await this.postRepo.save(
      this.postRepo.create({
        userId,
        title: data.title,
        content: data.content,
        imageUrls: data.imageUrls || [],
        status: 1,
      }),
    );

    return this.getPostById(post.id);
  }

  async deletePost(userId: number, postId: number) {
    const post = await this.postRepo.findOne({ where: { id: postId, userId } });

    if (!post) {
      throw new NotFoundException('帖子不存在或无权限');
    }

    await this.postRepo.update(postId, { status: 0 });
    return { success: true };
  }

  // ─── 帖子评论 ────────────────────────────────────────────────────────────

  async getComments(postId: number, page = 1, pageSize = 20) {
    const [list, total] = await this.commentRepo.findAndCount({
      where: { postId, status: 1, parentId: 0 },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 获取子评论
    for (const comment of list) {
      const replies = await this.commentRepo.find({
        where: { postId, parentId: comment.id, status: 1 },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
      (comment as any).replies = replies.map((r) => this.formatComment(r));
    }

    return {
      list: list.map((c) => this.formatComment(c)),
      total,
      page,
      pageSize,
    };
  }

  async createComment(
    userId: number,
    postId: number,
    data: { content: string; parentId?: number },
  ) {
    // 检查帖子是否存在
    const post = await this.postRepo.findOne({ where: { id: postId, status: 1 } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const comment = await this.commentRepo.save(
      this.commentRepo.create({
        userId,
        postId,
        content: data.content,
        parentId: data.parentId || 0,
        status: 1,
      }),
    );

    // 更新评论数
    await this.postRepo.update(postId, { commentCount: post.commentCount + 1 });

    const saved = await this.commentRepo.findOne({
      where: { id: comment.id },
      relations: ['user'],
    });

    return this.formatComment(saved!);
  }

  async likePost(userId: number, postId: number) {
    const existing = await this.likeRepo.findOne({ where: { userId, postId } });

    if (existing) {
      // 取消点赞
      await this.likeRepo.delete(existing.id);
      await this.postRepo.decrement({ id: postId }, 'likeCount', 1);
      return { liked: false };
    }

    // 添加点赞
    await this.likeRepo.save(this.likeRepo.create({ userId, postId }));
    await this.postRepo.increment({ id: postId }, 'likeCount', 1);

    return { liked: true };
  }

  // ─── 好物推荐 ────────────────────────────────────────────────────────────

  async getRecommendations(page = 1, pageSize = 20, keyword?: string) {
    const whereCondition = keyword
      ? [{ productName: Like(`%${keyword}%`), status: 1 }]
      : { status: 1 };

    const [list, total] = await this.recommendRepo.findAndCount({
      where: whereCondition,
      relations: ['user'],
      order: { likeCount: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      list: list.map((r) => this.formatRecommend(r)),
      total,
      page,
      pageSize,
    };
  }

  async createRecommendation(
    userId: number,
    data: { productName: string; productUrl?: string; imageUrl?: string; price?: number; reason: string },
  ) {
    const recommend = await this.recommendRepo.save(
      this.recommendRepo.create({
        userId,
        productName: data.productName,
        productUrl: data.productUrl,
        imageUrl: data.imageUrl,
        price: data.price,
        reason: data.reason,
        status: 1,
      }),
    );

    const saved = await this.recommendRepo.findOne({
      where: { id: recommend.id },
      relations: ['user'],
    });

    return this.formatRecommend(saved!);
  }

  async likeRecommendation(userId: number, recommendId: number) {
    const recommend = await this.recommendRepo.findOne({ where: { id: recommendId, status: 1 } });
    if (!recommend) {
      throw new NotFoundException('推荐不存在');
    }

    // TODO: 添加点赞记录表（类似 PostLike）

    await this.recommendRepo.increment({ id: recommendId }, 'likeCount', 1);
    return { liked: true, likeCount: recommend.likeCount + 1 };
  }

  // ─── 二手转售 ────────────────────────────────────────────────────────────

  async getResaleItems(page = 1, pageSize = 20, keyword?: string) {
    const whereCondition = keyword
      ? [{ productName: Like(`%${keyword}%`), status: 1 }]
      : { status: 1 };

    const [list, total] = await this.resaleRepo.findAndCount({
      where: whereCondition,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      list: list.map((r) => this.formatResale(r)),
      total,
      page,
      pageSize,
    };
  }

  async createResaleItem(
    userId: number,
    data: {
      productName: string;
      productUrl?: string;
      imageUrls?: string[];
      originalPrice?: number;
      salePrice: number;
      condition: string;
      description?: string;
    },
  ) {
    const item = await this.resaleRepo.save(
      this.resaleRepo.create({
        userId,
        productName: data.productName,
        productUrl: data.productUrl,
        imageUrls: data.imageUrls || [],
        originalPrice: data.originalPrice,
        salePrice: data.salePrice,
        condition: data.condition,
        description: data.description,
        status: 1,
      }),
    );

    const saved = await this.resaleRepo.findOne({
      where: { id: item.id },
      relations: ['user'],
    });

    return this.formatResale(saved!);
  }

  async updateResaleItem(userId: number, itemId: number, status: number) {
    const item = await this.resaleRepo.findOne({ where: { id: itemId, userId } });
    if (!item) {
      throw new NotFoundException('商品不存在或无权限');
    }

    await this.resaleRepo.update(itemId, { status });
    return { success: true };
  }

  // ─── 评价晒单 ────────────────────────────────────────────────────────────

  async getReviews(page = 1, pageSize = 20, keyword?: string, platform?: string) {
    const conditions: any = { status: 1 };
    if (keyword) {
      conditions.productName = Like(`%${keyword}%`);
    }
    if (platform) {
      conditions.platform = platform;
    }

    const [list, total] = await this.reviewRepo.findAndCount({
      where: conditions,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      list: list.map((r) => this.formatReview(r)),
      total,
      page,
      pageSize,
    };
  }

  async createReview(
    userId: number,
    data: {
      productId?: number;
      productName: string;
      platform?: string;
      rating: number;
      content: string;
      imageUrls?: string[];
    },
  ) {
    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        userId,
        productId: data.productId,
        productName: data.productName,
        platform: data.platform,
        rating: data.rating,
        content: data.content,
        imageUrls: data.imageUrls || [],
        status: 1,
      }),
    );

    const saved = await this.reviewRepo.findOne({
      where: { id: review.id },
      relations: ['user'],
    });

    return this.formatReview(saved!);
  }

  async likeReview(userId: number, reviewId: number) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId, status: 1 } });
    if (!review) {
      throw new NotFoundException('评价不存在');
    }

    await this.reviewRepo.increment({ id: reviewId }, 'likeCount', 1);
    return { liked: true, likeCount: review.likeCount + 1 };
  }

  // ─── 辅助方法 ────────────────────────────────────────────────────────────

  private formatPost(post: ForumPost) {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      imageUrls: post.imageUrls || [],
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      viewCount: post.viewCount,
      createdAt: post.createdAt,
      user: post.user
        ? {
            id: post.user.id,
            nickname: post.user.nickname,
            avatarUrl: post.user.avatarUrl,
          }
        : null,
    };
  }

  private formatComment(comment: PostComment) {
    return {
      id: comment.id,
      content: comment.content,
      likeCount: comment.likeCount,
      createdAt: comment.createdAt,
      user: comment.user
        ? {
            id: comment.user.id,
            nickname: comment.user.nickname,
            avatarUrl: comment.user.avatarUrl,
          }
        : null,
    };
  }

  private formatRecommend(recommend: ProductRecommend) {
    return {
      id: recommend.id,
      productName: recommend.productName,
      productUrl: recommend.productUrl,
      imageUrl: recommend.imageUrl,
      price: Number(recommend.price),
      reason: recommend.reason,
      likeCount: recommend.likeCount,
      createdAt: recommend.createdAt,
      user: recommend.user
        ? {
            id: recommend.user.id,
            nickname: recommend.user.nickname,
            avatarUrl: recommend.user.avatarUrl,
          }
        : null,
    };
  }

  private formatResale(item: ResaleItem) {
    return {
      id: item.id,
      productName: item.productName,
      productUrl: item.productUrl,
      imageUrls: item.imageUrls || [],
      originalPrice: Number(item.originalPrice),
      salePrice: Number(item.salePrice),
      condition: item.condition,
      description: item.description,
      viewCount: item.viewCount,
      likeCount: item.likeCount,
      status: item.status,
      createdAt: item.createdAt,
      user: item.user
        ? {
            id: item.user.id,
            nickname: item.user.nickname,
            avatarUrl: item.user.avatarUrl,
          }
        : null,
    };
  }

  private formatReview(review: ProductReview) {
    return {
      id: review.id,
      productName: review.productName,
      productId: review.productId,
      platform: review.platform,
      rating: review.rating,
      content: review.content,
      imageUrls: review.imageUrls || [],
      likeCount: review.likeCount,
      createdAt: review.createdAt,
      user: review.user
        ? {
            id: review.user.id,
            nickname: review.user.nickname,
            avatarUrl: review.user.avatarUrl,
          }
        : null,
    };
  }
}
