// Firestore persistence for AI-generated / user-contributed data:
//  - micros reports (per day+language)        users/{id}/micros/{date_lang}
//  - saved meal plans (history)               users/{id}/meal_plans/{autoId}
//  - community custom products (barcode DB)    custom_products/{barcode}
import {
  collection, doc, setDoc, getDoc, getDocs, addDoc, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

// ───────────── Micronutrient reports ─────────────
export async function saveMicrosReport(email: string, date: string, lang: string, hash: string, report: any) {
  const id = emailToDocId(email);
  if (!id) return;
  try {
    await setDoc(doc(db, 'users', id, 'micros', `${date}_${lang}`), {
      date, lang, hash, report, updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) { console.warn('[aiStore] saveMicros failed', e); }
}
export async function getMicrosReport(email: string, date: string, lang: string, hash: string): Promise<any | null> {
  const id = emailToDocId(email);
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id, 'micros', `${date}_${lang}`));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return d.hash === hash ? d.report : null; // only reuse if the day's foods are unchanged
  } catch { return null; }
}

// ───────────── Saved meal plans ─────────────
export interface SavedMealPlan { id?: string; plan: any; targets?: any; createdAt?: any; }
export async function saveMealPlan(email: string, plan: any, targets?: any): Promise<string | null> {
  const id = emailToDocId(email);
  if (!id) return null;
  try {
    const ref = await addDoc(collection(db, 'users', id, 'meal_plans'), {
      plan, targets: targets || null, createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) { console.warn('[aiStore] saveMealPlan failed', e); return null; }
}
export async function listMealPlans(email: string, max = 30): Promise<SavedMealPlan[]> {
  const id = emailToDocId(email);
  if (!id) return [];
  try {
    const q = query(collection(db, 'users', id, 'meal_plans'), orderBy('createdAt', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) { console.warn('[aiStore] listMealPlans failed', e); return []; }
}

// ───────────── Community custom products (barcode DB) ─────────────
export interface CustomProduct {
  barcode: string; name: string; brand?: string;
  calories: string; protein: string; carbs: string; fat: string;
  productImage?: string;  // base64 (data URI)
  barcodeImage?: string;  // base64 (data URI)
  createdBy?: string; createdAt?: any;
}
export async function getCustomProduct(barcode: string): Promise<CustomProduct | null> {
  if (!barcode) return null;
  try {
    const snap = await getDoc(doc(db, 'custom_products', barcode));
    return snap.exists() ? (snap.data() as CustomProduct) : null;
  } catch { return null; }
}
export async function saveCustomProduct(p: CustomProduct, email?: string): Promise<void> {
  if (!p.barcode) return;
  try {
    await setDoc(doc(db, 'custom_products', p.barcode), {
      ...p, createdBy: email ? emailToDocId(email) : null, createdAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) { console.warn('[aiStore] saveCustomProduct failed', e); throw e; }
}
