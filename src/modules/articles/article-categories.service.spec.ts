import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArticleCategoriesService } from './article-categories.service';
import { ArticleCategory } from './entities/article-category.entity';
import { Article } from './entities/article.entity';

function makeCategory(
  overrides: Partial<ArticleCategory> = {},
): ArticleCategory {
  return {
    id: 'cat-1',
    name: 'Panduan Beli',
    slug: 'panduan-beli',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    articles: [],
    ...overrides,
  };
}

describe('ArticleCategoriesService', () => {
  let service: ArticleCategoriesService;
  let categoriesRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let articlesRepo: { count: jest.Mock };

  beforeEach(async () => {
    categoriesRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((entity: Partial<ArticleCategory>) => entity),
      save: jest.fn((entity: ArticleCategory) => Promise.resolve(entity)),
      remove: jest.fn(),
    };
    articlesRepo = { count: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleCategoriesService,
        {
          provide: getRepositoryToken(ArticleCategory),
          useValue: categoriesRepo,
        },
        { provide: getRepositoryToken(Article), useValue: articlesRepo },
      ],
    }).compile();

    service = module.get(ArticleCategoriesService);
  });

  describe('remove', () => {
    it('404s when the category does not exist', async () => {
      categoriesRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException (not a raw FK driver error) when articles still reference it', async () => {
      categoriesRepo.findOne.mockResolvedValueOnce(makeCategory());
      articlesRepo.count.mockResolvedValueOnce(3);
      await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
      expect(categoriesRepo.remove).not.toHaveBeenCalled();
    });

    it('removes the category once no articles reference it', async () => {
      const category = makeCategory();
      categoriesRepo.findOne.mockResolvedValueOnce(category);
      articlesRepo.count.mockResolvedValueOnce(0);
      await service.remove('cat-1');
      expect(categoriesRepo.remove).toHaveBeenCalledWith(category);
    });
  });

  describe('create', () => {
    it('derives a slug from name when slug is omitted', async () => {
      categoriesRepo.findOne.mockResolvedValue(null); // slug free
      const category = await service.create({ name: 'Berita Pasar' });
      expect(category.slug).toBe('berita-pasar');
    });
  });
});
