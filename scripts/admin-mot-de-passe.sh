#!/bin/sh
# Definir le mot de passe d'un compte admin du back-office.
# ---------------------------------------------------------------------------
# A lancer SUR srv3 :
#     cd ~/apps/salorie-stack && sh ~/salorie/scripts/admin-mot-de-passe.sh
#
# POURQUOI CE SCRIPT EXISTE
#
# Les mots de passe admin sont stockes en bcrypt (`web/lib/adminAuth.ts`), un
# hachage a SENS UNIQUE. Personne ne peut lire celui d'un compte existant — ni
# son createur, ni un journal, ni une sauvegarde. C'est le comportement voulu :
# une base volee ne livre aucun mot de passe. La seule issue, quand on l'a
# perdu, est d'en DEFINIR un nouveau.
#
# Le mot de passe est saisi ici, sur le serveur, sans echo et sans passer par un
# journal, un historique de commandes ou une conversation.
set -eu

[ -f docker-compose.yml ] || { echo "Lance-moi depuis ~/apps/salorie-stack"; exit 1; }

printf 'Adresse e-mail du compte admin : '
read EMAIL
[ -n "$EMAIL" ] || { echo "e-mail vide"; exit 1; }

# `stty -echo` plutot que `read -s` : `read -s` est une extension bash, absente
# du /bin/sh de beaucoup d'images. Le piege `trap` remet l'affichage meme si on
# interrompt au Ctrl-C — sans quoi le terminal reste muet apres coup.
trap 'stty echo 2>/dev/null || true' EXIT INT TERM
printf 'Nouveau mot de passe (rien ne s affiche) : '
stty -echo 2>/dev/null || true
read MDP
stty echo 2>/dev/null || true
printf '\n'
[ ${#MDP} -ge 8 ] || { echo "Trop court : 8 caracteres au minimum."; exit 1; }

# Le hachage se fait DANS le conteneur web, qui porte deja bcryptjs et l'acces a
# Mongo. Le mot de passe transite par l'entree standard, jamais par la ligne de
# commande : `ps` la montrerait a tout utilisateur de la machine.
printf '%s\n%s\n' "$EMAIL" "$MDP" | docker compose exec -T web node -e '
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
let entree = "";
process.stdin.on("data", (d) => (entree += d));
process.stdin.on("end", async () => {
  const [email, mdp] = entree.split("\n");
  const url = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!url) { console.error("MONGODB_URI absente du conteneur web"); process.exit(1); }
  await mongoose.connect(url);
  const M = mongoose.model("AdminUser", new mongoose.Schema({}, { strict: false, collection: "adminusers" }));
  const hash = await bcrypt.hash(mdp.trim(), 10);
  const cible = email.trim().toLowerCase();
  const existant = await M.findOne({ email: cible });
  if (existant) {
    await M.updateOne({ email: cible }, { $set: { passwordHash: hash } });
    console.log("  mot de passe REMPLACE pour " + cible + " (role inchange)");
  } else {
    // `owner` : voir roleOf() — un compte sans role vaut deja owner, on est explicite.
    await M.create({ email: cible, passwordHash: hash, role: "owner", createdAt: new Date() });
    console.log("  compte CREE : " + cible + " (owner)");
  }
  await mongoose.disconnect();
});
'
MDP=""
echo
echo "Termine. Connecte-toi sur https://salorie.com/login"
