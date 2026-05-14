import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { CONFIG } from '../constants/config';
import PurchasesUI from 'react-native-purchases-ui';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

export class PurchasesService {
  static async initialize() {
    try {
      console.log('\x1b[32m[API→RevenueCat] configure REQUEST\x1b[0m', {
        platform: Platform.OS, isExpoGo,
      });
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      if (Platform.OS === 'ios') {
        if (CONFIG.revenueCatApiKeyIos) {
          Purchases.configure({ apiKey: CONFIG.revenueCatApiKeyIos });
          console.log('\x1b[34m[API←RevenueCat] configure OK (iOS)\x1b[0m');
        }
      } else if (Platform.OS === 'android') {
        if (CONFIG.revenueCatApiKeyAndroid) {
          Purchases.configure({ apiKey: CONFIG.revenueCatApiKeyAndroid });
          console.log('\x1b[34m[API←RevenueCat] configure OK (Android)\x1b[0m');
        }
      }
    } catch (error) {
      console.log('\x1b[34m[API←RevenueCat] configure FAILED (Expo Go or missing native module):\x1b[0m', (error as Error).message);
    }
  }

  static async isPremium(): Promise<boolean> {
    try {
      if (isExpoGo) {
        console.log('\x1b[32m[API→RevenueCat] isPremium SKIPPED (Expo Go)\x1b[0m');
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
      if (isExpoGo) {
        console.log('\x1b[32m[API→RevenueCat] presentPaywall SKIPPED (Expo Go)\x1b[0m');
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
