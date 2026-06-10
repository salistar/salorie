'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Rafraîchit les données serveur (Firestore) toutes les N secondes → admin "temps réel".
export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const i = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(i);
  }, [router, seconds]);
  return null;
}
