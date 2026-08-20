import Landing from './Landing';
import { getReleaseMeta, alternatesFor } from './releaseMeta';

export const metadata = {
  title: 'Salorie — Compteur de calories par photo, propulsé par l\'IA',
  description:
    'Photographie ton assiette : Salorie identifie les aliments et calcule calories, macros et micronutriments en moins de deux secondes. Coach adaptatif, plans de repas, Health Connect. Français, English, العربية.',
  alternates: alternatesFor('https://salorie.com/'),
};

export default async function Page() {
  const meta = await getReleaseMeta();
  return <Landing meta={meta} langueForcee="fr" />;
}
