import { Injectable } from '@nestjs/common';
import { MediaService, MediaImageDto } from '../media/media.service';
import { SeoSettings } from './entities/seo-settings.entity';
import { PageSeo } from './entities/page-seo.entity';

export type SeoSettingsPayload = {
  organizationName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  streetAddress: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  postalCode: string | null;
  socialLinks: Record<string, string>;
  googleSiteVerification: string | null;
  bingSiteVerification: string | null;
  defaultOgImage: MediaImageDto | null;
};

export type PageSeoPayload = {
  pageKey: string;
  metaTitle: string | null;
  metaDescription: string | null;
  heading: string | null;
  noIndex: boolean;
  ogImage: MediaImageDto | null;
};

/** Same reasoning as ContentBlocksMapper: entities carry a raw
 *  `xMediaAsset` relation (storage keys, not URLs) — every response goes
 *  through MediaService.buildImageDto() first. */
@Injectable()
export class SeoMapper {
  constructor(private readonly mediaService: MediaService) {}

  toSettingsPayload(settings: SeoSettings): SeoSettingsPayload {
    return {
      organizationName: settings.organizationName,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      streetAddress: settings.streetAddress,
      addressLocality: settings.addressLocality,
      addressRegion: settings.addressRegion,
      postalCode: settings.postalCode,
      socialLinks: settings.socialLinks ?? {},
      googleSiteVerification: settings.googleSiteVerification,
      bingSiteVerification: settings.bingSiteVerification,
      defaultOgImage: settings.defaultOgMediaAsset
        ? this.mediaService.buildImageDto(settings.defaultOgMediaAsset)
        : null,
    };
  }

  toPagePayload(page: PageSeo): PageSeoPayload {
    return {
      pageKey: page.pageKey,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      heading: page.heading,
      noIndex: page.noIndex,
      ogImage: page.ogMediaAsset
        ? this.mediaService.buildImageDto(page.ogMediaAsset)
        : null,
    };
  }
}
