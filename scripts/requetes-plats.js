// Comment CHERCHER chacune des 71 classes hors Food-101.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE SEPAREMENT
// La moisson du 30/08/2026 posait UNE question par plat — le nom de la classe —
// et concluait « source epuisee » quand elle rendait peu. C'etait une conclusion
// sur la question, pas sur le monde : chaque requete a son propre index, et
// « msemen » ne ramene pas ce que ramene « moroccan pancake ».
//
// Trois familles de variantes, et chacune a une raison :
//
//   TRANSLITTERATION  L'arabe s'ecrit en latin de plusieurs facons, et aucune ne
//                     domine : msemen/msemmen, bastila/pastilla/bisteeya,
//                     chebakia/chebbakia, maakouda/maqouda. Un fonds indexe une
//                     graphie et ignore les autres.
//   DESCRIPTION       Le photographe qui ne connait pas le nom decrit le plat :
//                     « moroccan thousand hole pancake » pour baghrir. Ces
//                     images existent et ne portent JAMAIS le nom de la classe.
//   FRANCAIS          Le Maroc est francophone : « cornes de gazelle » et
//                     « tajine aux coings » sont des titres reels sur Commons.
//
// ⚠ CE QUI N'EST PAS LA, ET POURQUOI.
// L'arabe (طاجين, مسمن, رفيسة) a ete essaye le 02/09/2026 sur Wikimedia Commons :
// ZERO resultat pour les trois. Commons n'indexe pas ses titres en arabe. La
// piste est fermee, mesuree — pas oubliee.
//
// ⚠ CE QUE CETTE TABLE NE PEUT PAS REPARER.
// Cinq classes sont des variantes d'un meme plat (« tagine », « tagine with
// beef », « tagine with quince », « tagine with vegetables », « tagine with
// artichokes and peas »). Aucune requete ne les separera de facon fiable, parce
// que les titres eux-memes ne les separent pas. Les requetes sont donc etroites
// pour les variantes et larges pour la classe generique : mieux vaut peu
// d'images justes que beaucoup de « tagine » rangees sous « tagine aux coings ».

// Les classes qui ne sont marocaines que par leur presence dans la carte : un
// pomme reste une pomme, et les fonds generalistes en regorgent. Les separer
// evite de croire que « 71 classes marocaines manquent » alors qu'un tiers
// d'entre elles est trivial a nourrir.
const GENERIQUES = new Set([
  'apple', 'banana', 'orange', 'pear', 'dates', 'jam', 'lentils', 'salmon',
  'croissant', 'chicken nuggets', 'spagetti', 'nougat', 'roasted chicken',
  'sweet bread', 'crackers with almonds', 'snowballs', 'meat brochettes',
]);

const REQUETES = {
  // ── patisserie et douceurs ────────────────────────────────────────────────
  amlou: ['amlou', 'amlou argan almond spread', 'moroccan argan spread',
    'amlou marocain', 'argan almond honey paste'],
  baghrir: ['baghrir', 'beghrir', 'moroccan thousand hole pancake',
    'moroccan semolina pancake', 'baghrir marocain', 'crepe mille trous'],
  // ⚠ JAMAIS « bahla » SEUL : c'est le nom d'un fort omanais classe a l'UNESCO,
  // et la moisson du 02/09/2026 a rempli cette classe d'une route et d'une porte
  // monumentale. Le plat est une ghriba — c'est ce mot qui doit porter la requete.
  bahla: ['ghriba bahla', 'ghoriba bahla', 'moroccan ghriba cookie',
    'ghriba marocaine', 'ghoriba biscuit marocain'],
  basbousa: ['basbousa', 'namoura', 'revani semolina cake', 'basbousa cake'],
  chebakia: ['chebakia', 'chebbakia', 'moroccan sesame honey cookie', 'griwech'],
  fekkas: ['fekkas', 'moroccan biscotti', 'fekkas almond biscuit'],
  'kaab el ghazal': ['kaab el ghazal', 'gazelle horns pastry',
    'cornes de gazelle', 'kaab ghzal', 'cornes de gazelle patisserie'],
  kaak: ['kaak bread ring', 'moroccan kaak', 'kaak biscuit', 'kaak marocain',
    'anise bread ring'],
  khringo: ['khringo', 'moroccan honey fritter'],
  mhancha: ['mhancha', 'moroccan snake cake', 'mhancha almond pastry',
    'm hanncha marocain', 'gateau serpent amandes'],
  sellou: ['sellou', 'sfouf moroccan', 'slilou'],
  sfenj: ['sfenj', 'sfinj', 'moroccan doughnut', 'sfenj marocain',
    'beignet marocain sfenj'],
  'traditional macaroon': ['ghriba', 'moroccan macaroon', 'ghriba coconut cookie'],
  nougat: ['nougat', 'nougat candy', 'torrone nougat'],
  snowballs: ['coconut snowball cake', 'snowball dessert coconut',
    'boule de neige gateau', 'coconut snowball pastry'],
  'crackers with almonds': ['almond cracker biscuit', 'almond thin biscuit',
    'craquelin aux amandes', 'almond crisp biscuit'],

  // ── pains et galettes ─────────────────────────────────────────────────────
  batbout: ['batbout', 'batbot', 'moroccan pita bread', 'mkhamer bread',
    'pain batbout', 'moroccan pan bread toghrift'],
  harcha: ['harcha', 'harsha', 'moroccan semolina bread'],
  msemen: ['msemen', 'msemmen', 'moroccan square pancake',
    'moroccan flatbread', 'msemen marocain', 'crepe feuilletee marocaine'],
  rghayf: ['rghaif', 'rghayef', 'moroccan layered flatbread',
    'rghaif marocain', 'meloui moroccan'],
  'traditional bread': ['khobz moroccan bread', 'moroccan round bread',
    'pain marocain', 'khobz dyal dar', 'moroccan home bread'],
  'sweet bread': ['sweet bread loaf', 'brioche loaf'],
  croissant: ['croissant', 'croissants pastry', 'butter croissant'],

  // ── feuilletes ────────────────────────────────────────────────────────────
  bastila: ['pastilla', 'bastilla', 'moroccan pastilla pie', 'bisteeya'],
  'chicken basstila': ['chicken pastilla', 'pastilla poulet', 'chicken bastilla'],
  'fish basstila': ['seafood pastilla', 'fish pastilla', 'pastilla fruits de mer',
    'pastilla au poisson', 'moroccan seafood pie'],
  briouat: ['briouat', 'briouats', 'moroccan filo triangle', 'brik pastry',
    'briouates marocaines', 'moroccan cigar pastry'],
  'briouate with almonds': ['briouat amandes', 'almond briouat',
    'briouats aux amandes', 'briouates amandes miel',
    'moroccan almond triangle pastry'],

  // ── plats et tagines ──────────────────────────────────────────────────────
  // ⚠ Requetes ETROITES pour les variantes : une requete large les remplirait
  // de tagines quelconques, et l'etiquette serait fausse.
  tagine: ['tagine', 'tajine', 'moroccan tagine', 'tagine dish morocco'],
  'tagine with beef': ['beef tagine', 'tajine de boeuf'],
  'tagine with quince': ['quince tagine', 'tajine aux coings', 'tajine coing',
    'lamb quince tagine moroccan'],
  'tagine with vegetables': ['vegetable tagine', 'tajine de legumes'],
  'tagine with artichokes and peas': ['artichoke pea tagine',
    'tajine artichauts petits pois', 'tajine aux artichauts',
    'moroccan artichoke tagine'],
  couscous: ['couscous', 'moroccan couscous', 'couscous royal', 'seven vegetable couscous'],
  rfissa: ['rfissa', 'trid moroccan', 'rfissa chicken lentils'],
  seffa: ['seffa', 'seffa medfouna', 'sweet vermicelli couscous'],
  'seffa with rice': ['seffa riz', 'moroccan sweet rice', 'seffa au riz',
    'riz sucre cannelle marocain'],
  tanjia: ['tanjia', 'tangia marrakech', 'tanjia marrakchia', 'tangia',
    'tanjia marocaine'],
  mechoui: ['mechoui', 'moroccan roast lamb', 'meshwi lamb'],
  'chicken with potatoes and olives': ['chicken tagine olives',
    'poulet olives citron confit', 'tajine poulet pommes de terre olives',
    'moroccan chicken potato olive'],
  'meatball with tomato sauce': ['kefta tagine', 'meatballs in tomato sauce', 'kofta tomato'],
  'meat brochettes': ['brochettes viande', 'grilled meat skewers', 'kebab skewers'],
  'roasted chicken': ['roast chicken dish', 'roasted whole chicken'],
  'fish and vegetables': ['baked fish with vegetables', 'poisson aux legumes'],
  'liver with sauce': ['kebda mchermla', 'moroccan liver kebda',
    'foie chermoula marocain', 'liver in tomato sauce'],
  // Le plat s'appelle hargma ou kraine ; « feet of beef » n'est le nom de rien.
  'feet of beef': ['hargma', 'hargma marocain', 'kraine moroccan',
    'moroccan calf foot chickpeas', 'pieds de veau pois chiches'],
  tkalya: ['tkalya', 'tqalia', 'moroccan tripe stew', 'kercha marocaine',
    'moroccan tripe dish'],
  karan: ['kalinte moroccan', 'garantita chickpea flan', 'karan chickpea'],

  // ── legumes, salades, soupes ──────────────────────────────────────────────
  harira: ['harira', 'harira soup', 'moroccan ramadan soup'],
  bissara: ['bissara', 'bessara', 'moroccan fava bean soup'],
  loubia: ['loubia', 'moroccan white bean stew', 'loubia beans'],
  'white beans with tomatoes': ['white beans tomato sauce', 'haricots blancs a la tomate'],
  'feves with sauce': ['fava beans in sauce', 'ful medames', 'foul beans dish'],
  zaalouk: ['zaalouk', 'moroccan eggplant salad', 'zaalouk aubergine',
    'zaalouk marocain', 'caviar aubergine marocain'],
  taktouka: ['taktouka', 'moroccan pepper tomato salad', 'taktouka marocaine',
    'salade poivrons tomates marocaine'],
  matbucha: ['matbucha', 'matbukha', 'cooked tomato pepper salad'],
  shakchouka: ['shakshuka', 'shakshouka', 'chakchouka', 'eggs in tomato sauce'],
  maakouda: ['maakouda', 'maqouda', 'moroccan potato fritter',
    'maakouda batata', 'beignet de pomme de terre marocain'],
  'tomatoes and onion salad': ['tomato onion salad', 'salade tomate oignon'],
  zitoun: ['moroccan olives bowl', 'marinated olives', 'olives vertes marinees'],
  lentils: ['lentil stew', 'cooked lentils dish', 'lentilles plat'],
  // « better beldi » transcrit BEURRE BELDI : le smen, beurre clarifie et
  // fermente. Chercher « better » ne rend rien de comestible.
  'better beldi': ['smen moroccan butter', 'beurre beldi', 'smen',
    'moroccan preserved butter', 'zebda beldia'],

  // ── generiques ────────────────────────────────────────────────────────────
  apple: ['apple', 'apples fruit', 'red apple', 'green apple'],
  banana: ['banana', 'bananas fruit', 'ripe banana'],
  orange: ['orange fruit', 'oranges', 'sliced orange'],
  pear: ['pear fruit', 'pears', 'ripe pear'],
  dates: ['dates fruit', 'medjool dates', 'dried dates'],
  jam: ['fruit jam jar', 'marmalade jar', 'confiture'],
  salmon: ['salmon fillet', 'grilled salmon', 'cooked salmon dish'],
  'chicken nuggets': ['chicken nuggets', 'fried chicken nuggets'],
  spagetti: ['spaghetti', 'spaghetti pasta dish', 'spaghetti bolognese'],
};

module.exports = { REQUETES, GENERIQUES };
