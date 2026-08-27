/**
 * Metadonnees du DERNIER build publie — source unique.
 *
 * ⚠ CE FICHIER VISAIT `releases/tags/v1.0.0`, EN DUR.
 * Les fichiers de cette release datent du 9 juin 2026 : 205 Mo d'APK contre 122
 * aujourd'hui. Quiconque installait Salorie depuis le site obtenait une version
 * anterieure au consentement d'amitie, au correctif de la faille Premium et a
 * Health Connect. Rien ne l'avait signale — un lien code en dur qui repond 200
 * a l'air parfaitement sain.
 *
 * TROIS PIEGES, tous verifies le 27/08/2026 :
 *   1. `releases/latest` renvoie `food4k-v1`, la release du MODELE ONNX. Une
 *      lecture naive aurait propose food4k.onnx (202 Mo) au telechargement.
 *   2. `v1.0.0-rc7` porte `app-debug.apk` : un build de debogage, sans cle
 *      Clerk, incapable de se connecter. Filtrer sur « .apk » ne suffit pas.
 *   3. L'API GitHub non authentifiee plafonne a 60 appels/heure. Sans cache, la
 *      section telechargement tombe aux heures de pointe — et un plafond
 *      atteint ne previent pas, il refuse.
 */
export type Actif = {
  nom: string;
  url: string;
  taille: number;
  tailleMo: string;
  sha256: string | null;
};

export type ReleaseMeta = {
  // Conserves pour les appelants existants : les trois pages linguistiques les
  // lisent deja. Les renommer aurait casse le rendu sans rien apporter.
  apkMB: string | null;
  aabMB: string | null;
  iso: string | null;
  // Nouveau : de quoi pointer vers le VRAI build, et le verifier.
  versionCode: number | null;
  tag: string | null;
  notesUrl: string | null;
  apk: Actif | null;
  aab: Actif | null;
} | null;

const DEPOT = 'salistar/salorie';
const estBuild = (t: unknown) => /^build-\d+$/.test(String(t ?? ''));
const apkPropre = (a: any) => String(a?.name).endsWith('.apk') && !/debug/i.test(String(a?.name));

function versActif(a: any, empreintes: Map<string, string>): Actif {
  return {
    nom: a.name,
    url: a.browser_download_url,
    taille: a.size,
    tailleMo: (a.size / 1024 / 1024).toFixed(0),
    sha256: empreintes.get(a.name) ?? null,
  };
}

export async function getReleaseMeta(): Promise<ReleaseMeta> {
  try {
    const res = await fetch(`https://api.github.com/repos/${DEPOT}/releases?per_page=30`, {
      next: { revalidate: 900 },
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;

    const toutes = await res.json();
    const candidates = (Array.isArray(toutes) ? toutes : [])
      .filter((x: any) => !x.draft && (x.assets || []).some(apkPropre))
      .sort((a: any, b: any) => String(b.published_at).localeCompare(String(a.published_at)));

    // Le schema `build-<versionCode>` d'abord ; a defaut la plus recente qui
    // porte un APK non-debug, pour que le site fonctionne avant le premier
    // build publie par le nouveau workflow.
    const rel = candidates.find((x: any) => estBuild(x.tag_name)) || candidates[0];
    if (!rel) return null;

    // Les empreintes vivent dans les notes, sous forme `nom | taille | `sha``.
    // Les y lire evite de les stocker deux fois — donc de les voir diverger.
    const empreintes = new Map<string, string>();
    for (const ligne of String(rel.body || '').split('\n')) {
      const m = ligne.match(/\|\s*(\S+\.(?:apk|aab))\s*\|[^|]*\|\s*`([0-9a-f]{64})`/i);
      if (m) empreintes.set(m[1], m[2].toLowerCase());
    }

    const brutApk = (rel.assets || []).find(apkPropre);
    const brutAab = (rel.assets || []).find((a: any) => String(a?.name).endsWith('.aab'));
    const apk = brutApk ? versActif(brutApk, empreintes) : null;
    const aab = brutAab ? versActif(brutAab, empreintes) : null;

    return {
      apkMB: apk?.tailleMo ?? null,
      aabMB: aab?.tailleMo ?? null,
      iso: brutApk?.updated_at ?? rel.published_at ?? null,
      versionCode: Number(String(rel.tag_name || '').replace(/\D+/g, '')) || null,
      tag: rel.tag_name ?? null,
      notesUrl: rel.html_url ?? null,
      apk,
      aab,
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
