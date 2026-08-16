import { expliquerRefus, verifierPhoto } from './moderation-chat';

/**
 * Les garde-fous sur les photos de chat.
 *
 * `verifierPhoto` vit dans `moderation-chat.ts`, et c'est LA MÊME fonction que la
 * passerelle appelle — pas une copie. Un test qui recopierait la règle ne
 * protégerait de rien : la passerelle pourrait changer sans qu'il bronche.
 *
 * Ce qui est en jeu : une photo entre en base et s'affiche chez tous les
 * participants d'une course. Un client modifié n'exécute pas notre code de
 * redimensionnement — c'est donc le serveur, et lui seul, qui décide.
 */

const BASE64_OK = 'iVBORw0KGgoAAAANSUhEUg==';

describe('ce qui passe', () => {
  it('accepte les trois formats prévus', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(verifierPhoto(BASE64_OK, t)).toBeNull();
    }
  });

  it('laisse passer un message sans photo', () => {
    expect(verifierPhoto('', '')).toBeNull();
    expect(verifierPhoto('', 'image/jpeg')).toBeNull();
  });
});

describe('ce qui est refusé', () => {
  it('refuse un type qui n’est pas une image', () => {
    // Un SVG peut porter du script ; un PDF ou un exécutable n'ont rien à faire
    // dans une bulle de chat. La liste est FERMÉE, pas une liste noire.
    for (const t of ['image/svg+xml', 'application/pdf', 'text/html', 'video/mp4', '']) {
      expect(verifierPhoto(BASE64_OK, t)).toBe('image_type');
    }
  });

  it('refuse une photo trop lourde', () => {
    // Le client redimensionne à 1024 px, mais un client modifié ne le fait pas.
    expect(verifierPhoto('A'.repeat(280001), 'image/jpeg')).toBe('image_poids');
    expect(verifierPhoto('A'.repeat(280000), 'image/jpeg')).toBeNull();
  });

  it('refuse ce qui n’est pas du base64 pur', () => {
    // Un préfixe `data:` ou du HTML glissé ici ressortirait tel quel dans le
    // client, qui le pose dans une balise Image.
    for (const mauvais of [
      'data:image/jpeg;base64,AAAA',
      '<script>alert(1)</script>',
      'AAAA AAAA',
      'AAAA\nAAAA',
      "'; DROP TABLE",
    ]) {
      expect(verifierPhoto(mauvais, 'image/jpeg')).toBe('image_format');
    }
  });

  it('vérifie le type AVANT le poids', () => {
    // Un fichier énorme au mauvais type doit être refusé sur le type : c'est le
    // motif que l'utilisateur peut corriger.
    expect(verifierPhoto('A'.repeat(300000), 'application/pdf')).toBe('image_type');
  });
});

describe('les refus sont expliqués', () => {
  it('a un message dans les trois langues pour chaque motif', () => {
    for (const motif of ['image_type', 'image_poids', 'image_format']) {
      for (const langue of ['fr', 'en', 'ar']) {
        const m = expliquerRefus(motif, langue);
        expect(`${motif}/${langue}: ${m}`).not.toBe(`${motif}/${langue}: `);
        // Un motif sans traduction renvoie souvent la clé brute : on le vérifie.
        expect(m).not.toBe(motif);
      }
    }
  });

  it('parle vraiment arabe en arabe', () => {
    expect(expliquerRefus('image_poids', 'ar')).toMatch(/[؀-ۿ]/);
  });
});
