'use client';
// Appels a l'API Salorie depuis le navigateur, avec l'identite de l'utilisateur.
// ---------------------------------------------------------------------------
// Le jeton est celui de Firebase, donc EXACTEMENT celui que le mobile envoie : le
// backend applique les memes gardes et les memes quotas, sans une ligne de code
// specifique au web. La liste CORS accepte deja `*.salorie.com`.
import { useCallback, useEffect, useState } from 'react';
import { PUBLIC_CONFIG } from './publicConfig';
import { jetonApi } from './firebaseBridge';

export async function appelApi<T = any>(
  chemin: string,
  options: { methode?: string; corps?: object } = {},
): Promise<T> {
  const jeton = await jetonApi();
  if (!jeton) throw new Error('session-absente');
  const rep = await fetch(`${PUBLIC_CONFIG.apiUrl}${chemin}`, {
    method: options.methode || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: options.corps ? JSON.stringify(options.corps) : undefined,
  });
  if (!rep.ok) throw new Error(`${chemin} ${rep.status}`);
  return rep.json();
}

/** Lecture simple d'une route de l'API, avec etat de chargement et d'erreur. */
export function useApi<T = any>(chemin: string | null) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    if (!chemin) return;
    setCharge(false);
    try {
      setDonnees(await appelApi<T>(chemin));
      setErreur(null);
    } catch (e: any) {
      setErreur(String(e?.message || e));
    } finally {
      setCharge(true);
    }
  }, [chemin]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  return { donnees, charge, erreur, recharger };
}
