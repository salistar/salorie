import type { MetadataRoute } from 'next';

// Corrige le 404 : robots.txt déclarait un sitemap inexistant. Next App Router sert
// ce fichier sur /sitemap.xml automatiquement.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://salorie.com';
  // Les trois versions linguistiques sont declarees avec leurs alternatives
  // mutuelles : sans cela Google les traiterait comme des pages concurrentes plutot
  // que comme la meme page en trois langues, et n'en indexerait qu'une.
  const langues = {
    fr: `${base}/`,
    en: `${base}/en`,
    ar: `${base}/ar`,
    'x-default': `${base}/`,
  };
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1, alternates: { languages: langues } },
    { url: `${base}/en`, changeFrequency: 'weekly', priority: 1, alternates: { languages: langues } },
    { url: `${base}/ar`, changeFrequency: 'weekly', priority: 1, alternates: { languages: langues } },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    // Exigence Play : l'URL de suppression doit être publique et indexable.
    { url: `${base}/delete-account`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
