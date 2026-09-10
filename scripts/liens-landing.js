// Tous les liens de la landing repondent-ils ?
// ---------------------------------------------------------------------------
// On lit le HTML SERVI (pas le source), on en extrait chaque href, et on appelle
// chacun. Le point n'est pas de compter les liens : c'est qu'un lien mort rend
// 404 sans que personne ne s'en aperçoive — et que la landing est la seule porte
// d'entree du produit.
const RACINE = process.argv[2] || 'https://salorie.com';

async function tete(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
    return { code: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { code: 0, ms: Date.now() - t0, err: String(e.message || e).slice(0, 40) };
  }
}

(async () => {
  const pages = ['/', '/en', '/ar', '/contact', '/privacy', '/terms', '/refund', '/delete-account'];
  const liens = new Set();

  console.log(`  cible : ${RACINE}\n`);
  console.log('  --- les pages elles-memes ---');
  for (const p of pages) {
    const r = await tete(RACINE + p);
    const etat = r.code >= 200 && r.code < 400 ? 'ok   ' : 'CASSE';
    console.log(`  ${etat} ${String(r.code).padEnd(4)} ${String(r.ms).padStart(6)} ms  ${p}`);
    if (r.code === 200) {
      const html = await fetch(RACINE + p).then((x) => x.text()).catch(() => '');
      for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) liens.add(m[1]);
    }
  }

  // On ne teste que les liens SORTANTS : les internes sont deja couverts au-dessus.
  const sortants = [...liens].filter((u) => !u.startsWith(RACINE)).sort();
  console.log(`\n  --- ${sortants.length} lien(s) sortant(s) ---`);
  const casses = [];
  for (const u of sortants) {
    const r = await tete(u);
    const ok = r.code >= 200 && r.code < 400;
    if (!ok) casses.push(`${u} → ${r.code}${r.err ? ' ' + r.err : ''}`);
    console.log(`  ${ok ? 'ok   ' : 'CASSE'} ${String(r.code).padEnd(4)} ${u.slice(0, 92)}`);
  }

  console.log(`\n  ${casses.length} lien(s) casse(s)`);
  for (const c of casses) console.log('     ' + c);
  process.exit(casses.length ? 1 : 0);
})();
