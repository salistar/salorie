'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Rafraîchit les données serveur (Firestore) périodiquement → admin "temps réel".
// Doux : seulement quand l'onglet est VISIBLE (pas de polling en arrière-plan).
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const i = setInterval(tick, seconds * 1000);
    return () => clearInterval(i);
  }, [router, seconds]);
  return null;
}
