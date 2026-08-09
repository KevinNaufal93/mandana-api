import type { FindOptionsWhere, Repository } from 'typeorm';

/** Lowercase, accent-stripped, hyphenated URL segment. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240); // headroom for the "-NN" collision suffix
}

/**
 * Slugify `base` and, if the result collides with an existing row, append
 * "-2", "-3", ... until a free slug is found. `excludeId` lets updates keep
 * an entity's own current slug without tripping over itself.
 */
export async function resolveUniqueSlug<T extends { id: string; slug: string }>(
  repo: Repository<T>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  let suffix = 2;

  for (;;) {
    const existing = await repo.findOne({
      where: { slug: candidate } as FindOptionsWhere<T>,
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${suffix++}`;
  }
}
