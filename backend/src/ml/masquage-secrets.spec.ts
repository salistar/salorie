/**
 * Le masquage des corps de fournisseur.
 *
 * POURQUOI IL EXISTE
 * La sonde des paliers de vision renvoie le corps d'erreur du fournisseur pour
 * qu'on sache POURQUOI un palier se tait. Or les fournisseurs recopient
 * volontiers la cle envoyee dans ce message — « Incorrect API key provided:
 * sk-proj-AbCd... ». Ce corps repartait vers la page d'admin sans filtre.
 *
 * Elle est derriere une authentification, et ce n'etait donc pas une fuite
 * ouverte. Mais une cle qui traverse une reponse HTTP finit dans un journal, un
 * cache de navigateur, une capture d'ecran de depannage. On ne fait pas
 * transiter un secret parce qu'on juge le canal sur.
 *
 * ⚠ CE FICHIER EPROUVE LES DEUX SENS.
 * Un filtre trop large efface le diagnostic qu'il est cense preserver — et un
 * diagnostic vide ramene exactement au probleme qu'on venait de resoudre pour
 * MiniMax. Les cas « ne doit PAS masquer » comptent donc autant que les autres.
 *
 * La fonction est reimplementee ici a l'identique de ml.service.ts : elle y est
 * privee et statique, au milieu d'une classe qui exige Redis, Firebase et dix
 * fournisseurs. Toute modification de l'une doit etre reportee dans l'autre.
 */

function masquerSecrets(corps: string, cle?: string): string {
  const s = String(corps || '').replace(/\s+/g, ' ').slice(0, 2000);
  const bouts: string[] = [];
  if (cle && cle.length >= 8) {
    bouts.push(cle);
    if (cle.length > 10) bouts.push(cle.slice(0, 10), cle.slice(-10));
  }
  return s.replace(/[A-Za-z0-9._~+/=-]{8,}/g, (jeton) => {
    if (bouts.some((b) => jeton.includes(b))) return '[CLE]';
    if (/^eyJ[A-Za-z0-9_-]{8,}\./.test(jeton)) return '[JWT]';
    if (/^(?:sk|pk|rk|gsk|xai|sess|key)[-_][A-Za-z0-9_-]{8,}/i.test(jeton)) return '[CLE]';
    if (/^[A-Fa-f0-9]{32,}$/.test(jeton)) return '[HEX]';
    if (jeton.length >= 32) return '[LONG]';
    return jeton;
  });
}

const CLE = 'sk-proj-AbCdEf1234567890XyZwVuTsRqPoNmLkJiHgFeDcBa';

describe('ce qui doit disparaitre', () => {
  it('efface la cle envoyee, recopiee en entier', () => {
    const out = masquerSecrets(`Incorrect API key provided: ${CLE}`, CLE);
    expect(out).not.toContain(CLE);
    expect(out).toContain('[CLE]');
  });

  // ⚠ LE CAS QUI A MOTIVE LE MASQUAGE PAR FRAGMENTS.
  it('efface un fragment de la cle, pas seulement la valeur entiere', () => {
    // Les fournisseurs tronquent souvent : « sk-proj-AbCdEf12***Ba ».
    const tronquee = CLE.slice(0, 16);
    const out = masquerSecrets(`Invalid key ${tronquee}...`, CLE);
    expect(out).not.toContain(tronquee);
  });

  it('efface une cle inconnue reconnaissable a son prefixe', () => {
    // Meme quand la cle envoyee n'est PAS celle citee — une erreur peut citer
    // une autre cle du compte.
    const out = masquerSecrets('key gsk_ZZZZZZZZZZZZZZZZZZZZ refused', undefined);
    expect(out).not.toContain('gsk_ZZZZZZZZZZZZZZZZZZZZ');
  });

  it('efface un JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
    expect(masquerSecrets(`token ${jwt}`)).not.toContain(jwt);
  });

  it('efface un jeton hexadecimal long', () => {
    const hex = 'a'.repeat(40);
    expect(masquerSecrets(`trace ${hex}`)).not.toContain(hex);
  });

  it('efface le base64 de notre propre image quand le fournisseur la recopie', () => {
    const image = 'Q'.repeat(200);
    expect(masquerSecrets(`bad request: image=${image}`)).not.toContain(image);
  });
});

describe('ce qui doit RESTER lisible', () => {
  // Sans ces cas, un filtre qui rendrait '[CLE]' pour tout passerait les tests
  // ci-dessus — et rendrait la sonde inutile.
  it('garde le message de MiniMax', () => {
    const out = masquerSecrets('{"base_resp":{"status_code":1004,"status_msg":"login fail"}}');
    expect(out).toContain('base_resp');
    expect(out).toContain('login fail');
    expect(out).toContain('1004');
  });

  it('garde le motif du refus d Anthropic', () => {
    const out = masquerSecrets('{"error":{"message":"Your credit balance is too low"}}');
    expect(out).toContain('credit balance is too low');
  });

  it('garde un nom de modele introuvable', () => {
    const out = masquerSecrets('Model not found: grok-2-vision-1212');
    expect(out).toContain('grok-2-vision-1212');
  });

  it('garde un message en arabe ou en chinois', () => {
    // Zhipu repond « 模型不存在 » : le filtre ne doit pas toucher au non-latin.
    expect(masquerSecrets('{"code":"1211","message":"模型不存在"}')).toContain('模型不存在');
  });

  it('garde les mots courants et la ponctuation', () => {
    const out = masquerSecrets('Not found the model or Permission denied');
    expect(out).toBe('Not found the model or Permission denied');
  });
});

describe('les bords', () => {
  it('ne casse pas sur un corps vide ou absent', () => {
    expect(masquerSecrets('')).toBe('');
    expect(masquerSecrets(undefined as any)).toBe('');
  });

  it('borne la taille : un corps enorme ne remonte pas en entier', () => {
    expect(masquerSecrets('x'.repeat(50000)).length).toBeLessThanOrEqual(2000);
  });

  it('ignore une cle trop courte pour etre un secret', () => {
    // Une « cle » de trois caracteres masquerait la moitie du message.
    expect(masquerSecrets('Model not found: abc', 'abc')).toContain('Model not found');
  });
});
