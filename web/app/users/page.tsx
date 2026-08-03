import { redirect } from 'next/navigation';

// /users (sans id) n'avait pas de page -> 404. La liste des utilisateurs vit sur le
// dashboard (Vue d'ensemble). On redirige donc proprement vers l'accueil.
export default function UsersIndex() {
  redirect('/');
}
