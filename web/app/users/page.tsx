import { redirect } from 'next/navigation';

// /users (sans id) n'avait pas de page -> 404. La liste des utilisateurs vit sur le
// dashboard (Vue d'ensemble). On y redirige donc -- PAS vers '/', qui est la
// landing publique : un admin déjà authentifié qui tape /users se retrouvait
// éjecté du back-office au lieu d'y rester.
export default function UsersIndex() {
  redirect('/admin');
}
