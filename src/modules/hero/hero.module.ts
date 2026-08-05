import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeroSlide } from './entities/hero-slide.entity';
import { HeroService } from './hero.service';
import { HeroController } from './hero.controller';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([HeroSlide]), HomepageCacheModule],
  providers: [HeroService],
  controllers: [HeroController],
  exports: [HeroService],
})
export class HeroModule {}
