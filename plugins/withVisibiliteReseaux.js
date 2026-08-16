// Expo config plugin : rendre les applications sociales VISIBLES a Salorie.
//
// POURQUOI CE PLUGIN EXISTE
//
// Depuis Android 11 (API 30), une application ne voit plus la liste des autres
// applications installees. `Linking.canOpenURL('whatsapp://send?text=…')` renvoie
// donc FAUX meme quand WhatsApp est bel et bien installe — sans le moindre message
// d'erreur. Un bouton « Partager sur WhatsApp » conditionne a ce test serait
// simplement invisible pour tout le monde, et rien n'expliquerait pourquoi.
//
// Le manifeste genere par Expo contient bien un bloc <queries>, mais il ne declare
// que les intentions VIEW en https (le necessaire pour ouvrir un navigateur). Aucun
// paquet social n'y figure. Verifie sur le manifeste genere le 16 aout 2026.
//
// CE QU'ON DECLARE, ET CE QU'ON NE DECLARE PAS
//
// Uniquement les applications vers lesquelles l'utilisateur peut choisir de
// partager. Declarer un paquet ne donne AUCUN acces a ses donnees : cela permet
// seulement de savoir s'il est installe et de lui envoyer une intention. Google
// demande que la liste reste courte et justifiee — une declaration large
// (`QUERY_ALL_PACKAGES`) exige une derogation et se fait refuser pour ce genre
// d'usage. On ne la demande pas.
//
// A NOTER : WhatsApp n'a en principe pas besoin de cette declaration si l'on passe
// par `https://wa.me/?text=…`, qui ouvre l'application quand elle est la et le web
// sinon. On le declare quand meme pour pouvoir MONTRER ou CACHER le bouton selon
// ce qui est reellement installe, plutot que d'afficher un raccourci qui retombe
// sur une page web.

const { withAndroidManifest } = require('@expo/config-plugins');

// Les noms de paquets sont ceux du Play Store, pas des noms d'affichage.
const PAQUETS = [
  'com.whatsapp', // WhatsApp — de loin le premier canal au Maroc
  'com.whatsapp.w4b', // WhatsApp Business, tres repandu chez les commercants
  'com.instagram.android',
  'com.facebook.katana', // Facebook
  'com.zhiliaoapp.musically', // TikTok (nom de paquet international)
  'com.ss.android.ugc.trill', // TikTok (variante distribuee dans certaines regions)
  'com.google.android.youtube',
  'org.telegram.messenger',
];

module.exports = function withVisibiliteReseaux(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifeste = cfg.modResults.manifest;

    // Expo a deja pose un <queries> (les intentions https). On s'y ajoute plutot
    // que d'en creer un second : deux blocs sont fusionnes par l'outillage, mais
    // un seul reste plus lisible pour qui inspecte le manifeste.
    if (!Array.isArray(manifeste.queries)) manifeste.queries = [{}];
    const bloc = manifeste.queries[0] || (manifeste.queries[0] = {});
    if (!Array.isArray(bloc.package)) bloc.package = [];

    const deja = new Set(bloc.package.map((p) => p?.$?.['android:name']).filter(Boolean));
    for (const nom of PAQUETS) {
      if (!deja.has(nom)) bloc.package.push({ $: { 'android:name': nom } });
    }

    return cfg;
  });
};
