import React from 'react';
import { render } from '@testing-library/react-native';

/**
 * Le sens de lecture arrive-t-il vraiment DANS une modale ?
 *
 * `rtlAuto.test.ts` vérifie l'aide `directionAuto()` isolément. Ici on rend une
 * vraie `<Modal>` de l'app pour valider le CÂBLAGE : une Modal React Native
 * s'affiche dans une hiérarchie native séparée et n'hérite pas du `direction:rtl`
 * de la racine, donc le style doit être posé sur son conteneur à elle. C'est ce
 * qui manquait sur les 16 modales avant le 16 août 2026.
 *
 * On prend `ModerationSheet` comme témoin : c'est la plus autonome des 12, et
 * elle est exigée par Google Play (contenu utilisateur), donc elle ne disparaîtra
 * pas.
 */

let mockLangue = 'ar';
jest.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ language: mockLangue, isRTL: mockLangue === 'ar' }),
  langueActuelle: () => mockLangue,
}));
jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light', colors: { primary: '#2e8b57' } }) }));
jest.mock('../../lib/moderation', () => ({
  reportContent: jest.fn(),
  blockUser: jest.fn(),
  REPORT_REASONS: ['spam', 'other'],
}));
jest.mock('lucide-react-native', () => ({
  Flag: () => null,
  Ban: () => null,
  X: () => null,
  ChevronLeft: () => null,
}));

import ModerationSheet from '../../components/ModerationSheet';
import { directionAuto } from '../../lib/rtl';

function rendre() {
  return render(
    <ModerationSheet
      visible
      onClose={() => {}}
      targetType={'post' as any}
      targetId="abc"
      targetName="Quelqu'un"
      reporterEmail="moi@exemple.com"
    />
  );
}

/** Le style du conteneur racine de la modale, aplati. */
function styleRacine(arbre: any) {
  // La Modal est le premier noeud ; son contenu direct porte le sens de lecture.
  const modale = arbre.UNSAFE_getByType(require('react-native').Modal);
  const contenu = modale.props.children;
  const style = (Array.isArray(contenu) ? contenu[0] : contenu)?.props?.style;
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

describe('le sens de lecture entre dans les modales', () => {
  it('pose direction:rtl sur le conteneur de la modale en arabe', () => {
    mockLangue = 'ar';
    expect(styleRacine(rendre())).toMatchObject({ direction: 'rtl' });
  });

  it('pose direction:ltr en français', () => {
    mockLangue = 'fr';
    expect(styleRacine(rendre())).toMatchObject({ direction: 'ltr' });
  });

  it("n'écrase pas le style de fond de la modale", () => {
    // Le piège du correctif : remplacer `style={styles.backdrop}` au lieu d'y
    // ajouter aurait donné une modale transparente, sans voile.
    mockLangue = 'ar';
    const style = styleRacine(rendre());
    expect(Object.keys(style).length).toBeGreaterThan(1);
    expect(style.flex ?? style.backgroundColor).toBeDefined();
  });

  it('la langue vient du miroir hors React, pas du contexte', () => {
    // `directionAuto()` ne prend aucun argument : c'est ce qui lui permet de vivre
    // dans un composant qui n'appelle pas useTranslation.
    mockLangue = 'ar';
    expect(directionAuto()).toEqual({ direction: 'rtl' });
  });
});
