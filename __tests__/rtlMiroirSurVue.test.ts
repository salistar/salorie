/**
 * Garde-fou : une transformation de MIROIR ne se pose jamais sur une icône.
 *
 * Le 20 août 2026, en arabe, le bouton retour était une boîte vide et le bouton
 * principal avait perdu sa flèche — sur toute l'app. Cause : react-native-svg
 * n'honore pas `transform: scaleX(-1)` posé sur le SVG. Il met à l'échelle autour
 * de l'ORIGINE et non du centre, le dessin sort de son cadre et se fait couper.
 * Une `View` enveloppante, elle, s'inverse autour de son centre.
 *
 * `rtlAuto.test.ts` passait au vert pendant tout ce temps : il vérifie ce que
 * `flipAuto()` RENVOIE, pas ce qui s'AFFICHE. Aucun test de valeur de retour ne
 * pouvait voir ce défaut — d'où ce test-ci, qui lit le source.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');
const DOSSIERS = ['app', 'components'];

/** Icônes lucide employées en miroir. Elles rendent un SVG. */
const ICONES = 'ArrowLeft|ArrowRight|ChevronLeft|ChevronRight|ExternalLink|LogOut|ChevronDown';
/** Une transformation qui contient un scaleX est un miroir. */
const MIROIR = String.raw`style=\{(?:flipAuto\(\)|[^}]*scaleX[^}]*)\}`;
const FAUTIF = new RegExp(String.raw`<(?:${ICONES})(?:(?!/>)[\s\S])*?\s${MIROIR}`, 'g');

function fichiers(dossier: string): string[] {
  const base = path.join(RACINE, dossier);
  if (!fs.existsSync(base)) return [];
  const sortie: string[] = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    const p = path.join(base, e.name);
    if (e.isDirectory()) sortie.push(...fichiers(path.join(dossier, e.name)));
    else if (e.name.endsWith('.tsx')) sortie.push(p);
  }
  return sortie;
}

describe('miroir RTL — la transformation va sur la View, jamais sur l’icône', () => {
  it('aucune icône ne porte elle-même un scaleX', () => {
    const coupables: string[] = [];
    for (const dossier of DOSSIERS) {
      for (const p of fichiers(dossier)) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.match(FAUTIF) || []) {
          coupables.push(`${path.relative(RACINE, p)} : ${m.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
    // Le message porte la solution, pas seulement le constat : qui lit cet échec
    // n'a aucune raison de connaître le piège de react-native-svg.
    expect(coupables.join('\n') && `\nEnvelopper dans une <View> qui porte le style :\n`
      + `  <View style={flipAuto()}><ArrowLeft size={20} color={c} /></View>\n\n`
      + coupables.join('\n')).toBe('');
  });

  it('se déclencherait bien sur le motif fautif', () => {
    // Sans ceci, une expression régulière cassée rendrait le test vert pour rien.
    const faux = `<ArrowLeft size={20} color={c} style={flipAuto()} />`;
    expect(faux.match(FAUTIF)).not.toBeNull();
    const bon = `<View style={flipAuto()}><ArrowLeft size={20} color={c} /></View>`;
    expect(bon.match(FAUTIF)).toBeNull();
  });
});
