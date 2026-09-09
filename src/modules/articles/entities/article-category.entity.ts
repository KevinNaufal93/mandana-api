import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Article } from './article.entity';

@Entity('article_categories')
export class ArticleCategory extends BaseEntity {
  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @OneToMany(() => Article, (a) => a.category)
  articles!: Article[];
}
