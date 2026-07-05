// Helpers de tracking (mesures, sommeil, humeur, templates) → sous-collections
// users/{docId}/<sub> (autorisées par les règles Firestore). Best-effort.
import { collection, addDoc, getDocs, query, orderBy, limit as qlimit, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

export async function deleteEntry(email: string, sub: string, entryId: string): Promise<boolean> {
  try {
    const id = emailToDocId(email);
    if (!id) return false;
    await deleteDoc(doc(db, 'users', id, sub, entryId));
    return true;
  } catch { return false; }
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function logEntry(email: string, sub: string, data: Record<string, any>): Promise<boolean> {
  try {
    const id = emailToDocId(email);
    if (!id) return false;
    await addDoc(collection(db, 'users', id, sub), { ...data, date: todayStr(), timestamp: serverTimestamp() });
    return true;
  } catch { return false; }
}

export async function getEntries(email: string, sub: string, max = 30): Promise<any[]> {
  try {
    const id = emailToDocId(email);
    if (!id) return [];
    const snap = await getDocs(query(collection(db, 'users', id, sub), orderBy('timestamp', 'desc'), qlimit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch { return []; }
}
