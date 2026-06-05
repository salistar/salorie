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

      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
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
}
