import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const SITE_URL = 'https://tools.hoglet.xyz';

const ROUTES: Array<{ path: string; priority: number }> = [
  { path: '', priority: 1 },
  { path: '/deploy', priority: 0.9 },
  { path: '/interactor', priority: 0.9 },
  { path: '/inspector', priority: 0.8 },
  { path: '/scripts', priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routing.locales.flatMap((locale) =>
    ROUTES.map(({ path, priority }) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority,
      alternates: {
        languages: Object.fromEntries([
          ...routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]),
          ['x-default', `${SITE_URL}/en${path}`],
        ]),
      },
    }))
  );
}
