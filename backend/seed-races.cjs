// Seed de PARCOURS PATRIMONIAUX marocains dans virtual_races (idempotent par nom).
// Le moteur de courses existe déjà : ces docs apparaissent direct dans l'app (aucun rebuild).
const mongoose = require('mongoose');

const wp = (kind, name, lat, lng, atKm, description) => ({
  kind, name, lat, lng, atKm, mediaType: 'streetview', mediaUrls: [], description,
});

const races = [
  {
    name: 'Tour du Maroc',
    emoji: '🇲🇦',
    description: 'Des côtes atlantiques aux médinas impériales puis Marrakech la rouge — traverse le Maroc à ton rythme.',
    totalKm: 600,
    timeLimitDays: 60,
    medalFrame: 'rabat',
    medalSpec: { shape: 'sunburst', color: '#2E8B57', metal: 'or', centerType: 'geo' },
    waypoints: [
      wp('start', 'Casablanca — Mosquée Hassan II', 33.6082, -7.6326, 0, 'Départ face à l’océan, au pied de la plus haute mosquée d’Afrique.'),
      wp('stop', 'Rabat — Tour Hassan', 34.0241, -6.8221, 90, 'La capitale et son minaret inachevé du XIIe siècle.'),
      wp('stop', 'Fès — Bab Boujloud', 34.0617, -4.9778, 290, 'La porte bleue de la plus ancienne médina vivante du monde.'),
      wp('end', 'Marrakech — Jemaa el-Fna', 31.6258, -7.9890, 600, 'Arrivée sur la place mythique, patrimoine oral de l’humanité.'),
    ],
  },
  {
    name: 'Route des Kasbahs',
    emoji: '🏰',
    description: 'Sur la piste des ksour de terre, d’Ouarzazate aux gorges du Todgha — la route mille fois filmée.',
    totalKm: 300,
    timeLimitDays: 45,
    medalFrame: 'rabat',
    medalSpec: { shape: 'shield', color: '#B45309', metal: 'bronze', centerType: 'geo' },
    waypoints: [
      wp('start', 'Ouarzazate — Kasbah Taourirt', 30.9189, -6.8936, 0, 'La porte du désert et sa kasbah glaouie.'),
      wp('stop', 'Aït Benhaddou', 31.0470, -7.1318, 35, 'Ksar classé UNESCO, décor de tant de films.'),
      wp('stop', 'Vallée du Dadès', 31.3686, -5.9870, 170, 'Les doigts de singe et les gorges ocre.'),
      wp('end', 'Gorges du Todgha — Tinghir', 31.5852, -5.5938, 300, 'Arrivée entre les falaises de 300 m du Todgha.'),
    ],
  },
  {
    name: 'Chemin de La Mecque (virtuel)',
    emoji: '🕋',
    description: 'Une marche symbolique du Maroc vers les Lieux saints — chaque kilomètre te rapproche de la Kaaba.',
    totalKm: 1500,
    timeLimitDays: 120,
    medalFrame: 'rabat',
    medalSpec: { shape: 'star', color: '#1d6440', metal: 'or', centerType: 'geo' },
    waypoints: [
      wp('start', 'Casablanca', 33.5731, -7.5898, 0, 'Le départ depuis le Maroc.'),
      wp('stop', 'Le Caire — Al-Azhar', 30.0459, 31.2625, 700, 'Mille ans de savoir au cœur du monde arabe.'),
      wp('stop', 'Médine — Mosquée du Prophète', 24.4672, 39.6111, 1300, 'La ville lumineuse et son dôme vert.'),
      wp('end', 'La Mecque — la Kaaba', 21.4225, 39.8262, 1500, 'Arrivée à la Maison sacrée.'),
    ],
  },
];

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) { console.error('NO_MONGO_URI'); process.exit(2); }
  await mongoose.connect(uri);
  const C = mongoose.connection.collection('virtual_races');
  let added = 0;
  for (const r of races) {
    if (await C.findOne({ name: r.name })) { console.log('skip (existe déjà):', r.name); continue; }
    await C.insertOne({ ...r, tenantId: 'default', active: true, createdAt: new Date(), updatedAt: new Date() });
    added++; console.log('ajouté:', r.name, '(' + r.totalKm + ' km,', r.waypoints.length, 'waypoints)');
  }
  const total = await C.countDocuments({ active: true });
  console.log('SEED_OK ajoutés=' + added + ' total_actives=' + total);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR ' + (e && e.message)); process.exit(1); });
