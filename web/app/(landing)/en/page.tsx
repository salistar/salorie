import Landing from '../Landing';
import { getReleaseMeta, alternatesFor } from '../releaseMeta';

export const metadata = {
  title: 'Salorie — AI photo calorie counter',
  description:
    'Snap your plate: Salorie identifies the foods and computes calories, macros and micronutrients in under two seconds. Adaptive coach, meal plans, Health Connect. English, Français, العربية.',
  alternates: alternatesFor('https://salorie.com/en'),
};

export default async function Page() {
  const meta = await getReleaseMeta();
  return <Landing meta={meta} langueForcee="en" />;
}
