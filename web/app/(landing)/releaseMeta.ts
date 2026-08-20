/**
 * Tailles de l'APK et de l'AAB, lues sur la release GitHub.
 *
 * Extrait de page.tsx pour être partagé par les trois versions linguistiques : la
 * dupliquer aurait garanti qu'une seule soit corrigée le jour où l'URL de release
 * change.
 */
export type ReleaseMeta = { apkMB: string | null; aabMB: string | null; iso: string | null } | null;

export async function getReleaseMeta(): Promise<ReleaseMeta> {
  try {
    const res = await fetch('https://api.github.com/repos/salistar/salorie/releases/tags/v1.0.0', {
      next: { revalidate: 300 },
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
    const apk = data.assets?.find((a: any) => a.name.endsWith('.apk'));
    const aab = data.assets?.find((a: any) => a.name.endsWith('.aab'));
    return {
      apkMB: apk ? mb(apk.size) : null,
      aabMB: aab ? mb(aab.size) : null,
      iso: apk ? apk.updated_at : null,
    };
  } catch {
    return null;
  }
}

/**
 * Balises `hreflang` communes aux trois pages.
 *
 * Sans elles, Google voyait UNE seule URL en français : les versions anglaise et arabe
 * n'existaient que derrière un bouton, donc invisibles à l'indexation. Chaque page
 * déclare ses sœurs ET sa propre URL canonique, sinon les trois se concurrencent
 * comme du contenu dupliqué.
 *
 * `x-default` désigne la version servie à un visiteur dont la langue ne correspond à
 * aucune des nôtres — le français, qui est la racine.
 */
export const ALTERNATES = {
  fr: 'https://salorie.com/',
  en: 'https://salorie.com/en',
  ar: 'https://salorie.com/ar',
  'x-default': 'https://salorie.com/',
} as const;

export function alternatesFor(canonical: string) {
  return { canonical, languages: ALTERNATES };
}
