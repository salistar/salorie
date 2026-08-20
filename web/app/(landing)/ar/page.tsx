import Landing from '../Landing';
import { getReleaseMeta, alternatesFor } from '../releaseMeta';

export const metadata = {
  title: 'Salorie — عدّاد السعرات بالصورة بالذكاء الاصطناعي',
  description:
    'صوّر طبقك: يتعرّف Salorie على الأطعمة ويحسب السعرات والمغذّيات في أقل من ثانيتين. مدرّب متكيّف، خطط وجبات، Health Connect. العربية، الفرنسية، الإنجليزية.',
  alternates: alternatesFor('https://salorie.com/ar'),
};

export default async function Page() {
  const meta = await getReleaseMeta();
  return <Landing meta={meta} langueForcee="ar" />;
}
