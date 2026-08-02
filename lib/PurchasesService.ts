import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { CONFIG } from '../constants/config';
import PurchasesUI from 'react-native-purchases-ui';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * RevenueCat ferme l'app en build *release* si on lui passe une clé "Test Store"
 * (préfixe `test_`) — c'est un garde-fou natif que le try/catch JS n'attrape pas.
 * On ne configure donc le SDK que pour une vraie clé publique de production :
 *   - Android : `goog_...`
 *   - iOS     : `appl_...`
 *   - Amazon  : `amzn_...`
 * Tant qu'une clé de prod n'est pas fournie, on saute l'init proprement
 * (l'app tourne, le paywall est juste désactivé).
 */
function isProductionKey(key: string | undefined): key is string {
  if (!key) return false;
  if (key.startsWith('test_')) return false; // RevenueCat Test Store → interdit en release
  return /^(goog_|appl_|amzn_|rcb_)/.test(key);
}

/** Vue d'une offre côté UI — volontairement sans type RevenueCat sauf `raw`. */
export type SellablePackage = {
  id: string;
  priceString: string;
  period: 'monthly' | 'yearly' | 'weekly' | 'lifetime' | 'other';
  trialDays: number;
  raw: any;
};

/** ISO-8601 de durée (P1M, P1Y, P1W…) → période lisible. */
function normalizePeriod(iso?: string | null): SellablePackage['period'] {
  if (!iso) return 'lifetime';
  if (/P1?Y/.test(iso)) return 'yearly';
  if (/P1?M/.test(iso)) return 'monthly';
  if (/P1?W/.test(iso)) return 'weekly';
  return 'other';
}

/**
 * Durée d'essai en jours. RevenueCat expose l'info différemment selon la
 * plateforme et la version du SDK (`introPrice` côté iOS, `defaultOption` /
 * phases d'offre côté Android Billing 5+) — on lit les deux, 0 si rien.
 */
function trialDaysOf(prod: any): number {
  const iso: string | undefined =
    prod?.introPrice?.periodUnit && prod?.introPrice?.periodNumberOfUnits
      ? `${prod.introPrice.periodNumberOfUnits}${prod.introPrice.periodUnit}`
      : prod?.defaultOption?.freePhase?.billingPeriod?.iso8601;
  if (!iso) return 0;
  const m = /(\d+)\s*([DWMY])/i.exec(iso);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2].toUpperCase();
  return unit === 'D' ? n : unit === 'W' ? n * 7 : unit === 'M' ? n * 30 : n * 365;
}

export class PurchasesService {
  static configured = false;

  static async initialize() {
    try {
      console.log('\x1b[32m[API→RevenueCat] configure REQUEST\x1b[0m', {
        platform: Platform.OS, isExpoGo,
      });

      const key = Platform.OS === 'ios'
        ? CONFIG.revenueCatApiKeyIos
        : CONFIG.revenueCatApiKeyAndroid;

      if (!isProductionKey(key)) {
        console.log('\x1b[33m[RevenueCat] SKIP configure — clé de production absente ou clé de test (paywall désactivé)\x1b[0m');
        return;
      }

      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      Purchases.configure({ apiKey: key });
      PurchasesService.configured = true;
      console.log(`\x1b[34m[API←RevenueCat] configure OK (${Platform.OS})\x1b[0m`);
    } catch (error) {
      console.log('\x1b[34m[API←RevenueCat] configure FAILED (Expo Go or missing native module):\x1b[0m', (error as Error).message);
    }
  }

  static async isPremium(): Promise<boolean> {
    try {
      if (isExpoGo || !PurchasesService.configured) {
        console.log('\x1b[32m[API→RevenueCat] isPremium SKIPPED (Expo Go / non configuré)\x1b[0m');
        return false;
      }
      console.log('\x1b[32m[API→RevenueCat] getCustomerInfo REQUEST\x1b[0m');
      const t0 = Date.now();
      const customerInfo = await Purchases.getCustomerInfo();
      const isPrem = typeof customerInfo.entitlements.active['Premium'] !== "undefined";
      console.log('\x1b[34m[API←RevenueCat] getCustomerInfo RESPONSE\x1b[0m', {
        ms: Date.now() - t0,
        isPremium: isPrem,
        originalAppUserId: customerInfo.originalAppUserId,
        entitlementsActive: Object.keys(customerInfo.entitlements.active),
      });
      return isPrem;
    } catch (e) {
      console.warn('\x1b[34m[API←RevenueCat] getCustomerInfo FAILED:\x1b[0m', (e as Error).message);
      return false;
    }
  }

  static async showPaywall() {
    try {
      if (isExpoGo || !PurchasesService.configured) {
        console.log('\x1b[32m[API→RevenueCat] presentPaywall SKIPPED (Expo Go / non configuré)\x1b[0m');
        return;
      }
      const isPremium = await this.isPremium();
      if (!isPremium) {
        console.log('\x1b[32m[API→RevenueCat] presentPaywall REQUEST\x1b[0m');
        await PurchasesUI.presentPaywall();
        console.log('\x1b[34m[API←RevenueCat] presentPaywall CLOSED\x1b[0m');
      }
    } catch (error) {
      console.error('\x1b[34m[API←RevenueCat] presentPaywall FAILED:\x1b[0m', error);
    }
  }

  static async showPaywallIfNeeded() {
    try {
      const isPremium = await this.isPremium();
      if (!isPremium) {
        this.showPaywall();
      }
    } catch (error) {
      console.log('Paywall check skipped:', (error as Error).message);
    }
  }

  /**
   * Offres vendables, normalisées pour l'UI (l'écran ne touche JAMAIS aux types
   * RevenueCat — ça permet de rendre le paywall sans le SDK configuré, et de le
   * tester). Renvoie [] si le SDK n'est pas configuré ou si l'offering est vide.
   */
  static async getPackages(): Promise<SellablePackage[]> {
    try {
      if (isExpoGo || !PurchasesService.configured) return [];
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) return [];
      return current.availablePackages.map((p) => {
        const prod: any = p.product;
        return {
          id: p.identifier,
          // priceString est DÉJÀ localisé et dans la devise du Store (MAD au Maroc) :
          // ne jamais reformater soi-même, ce serait faux pour la moitié des marchés.
          priceString: prod.priceString as string,
          period: normalizePeriod(prod.subscriptionPeriod),
          // Essai gratuit : présent seulement si configuré côté Play Console.
          trialDays: trialDaysOf(prod),
          raw: p,
        };
      });
    } catch (e) {
      console.warn('\x1b[34m[API←RevenueCat] getOfferings FAILED:\x1b[0m', (e as Error).message);
      return [];
    }
  }

  /** true si on a quelque chose à vendre — sinon le paywall doit s'effacer, pas s'afficher vide. */
  static async hasSellableOffering(): Promise<boolean> {
    const pkgs = await PurchasesService.getPackages();
    return pkgs.length > 0;
  }

  /**
   * Achat d'un package. Renvoie 'purchased' | 'cancelled' | 'error'.
   * L'annulation utilisateur N'EST PAS une erreur : c'est le cas le plus fréquent,
   * et l'afficher comme un échec fait fuir des gens qui hésitaient seulement.
   */
  static async purchase(pkg: SellablePackage): Promise<'purchased' | 'cancelled' | 'error'> {
    try {
      if (isExpoGo || !PurchasesService.configured) return 'error';
      const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
      const ok = typeof customerInfo.entitlements.active['Premium'] !== 'undefined';
      console.log('\x1b[34m[API←RevenueCat] purchase RESPONSE\x1b[0m', { isPremium: ok });
      return ok ? 'purchased' : 'error';
    } catch (e: any) {
      if (e?.userCancelled) {
        console.log('[RevenueCat] achat annulé par l\'utilisateur');
        return 'cancelled';
      }
      console.warn('\x1b[34m[API←RevenueCat] purchase FAILED:\x1b[0m', e?.message);
      return 'error';
    }
  }

  // Restauration des achats — EXIGENCE Google Play (l'utilisateur doit pouvoir
  // récupérer un abonnement déjà acheté sur un nouvel appareil / après réinstall).
  // Renvoie true si l'entitlement Premium est actif après restauration.
  static async restorePurchases(): Promise<boolean> {
    try {
      if (isExpoGo || !PurchasesService.configured) {
        console.log('\x1b[32m[API→RevenueCat] restore SKIPPED (Expo Go / non configuré)\x1b[0m');
        return false;
      }
      const info = await Purchases.restorePurchases();
      const isPrem = typeof info.entitlements.active['Premium'] !== 'undefined';
      console.log('\x1b[34m[API←RevenueCat] restore OK\x1b[0m', { isPremium: isPrem });
      return isPrem;
    } catch (e) {
      console.warn('\x1b[34m[API←RevenueCat] restore FAILED:\x1b[0m', (e as Error).message);
      return false;
    }
  }
}
