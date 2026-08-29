// @couleurs-identite
// ---------------------------------------------------------------------------
// La couleur de la LED de notification s'allume HORS de l'application, sur
// l'ecran verrouille. Aucun theme ne s'y applique.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { updatePushToken, updateFcmToken, getAdminNotificationConfig, saveNotificationToHistory } from './firebase';

// EAS projectId — OBLIGATOIRE pour getExpoPushTokenAsync en build standalone
// (hors Expo Go). Sans lui, l'enregistrement du token push échoue silencieusement
// → l'admin ne trouve aucune cible. On le lit depuis la config, fallback en dur.
const EXPO_PROJECT_ID =
  (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
  (Constants as any)?.easConfig?.projectId ||
  '398124d2-f1df-4613-a1f7-62f2feb0d362';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

export class NotificationService {
  static async registerForPushNotificationsAsync(email: string) {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        // ⚠ La LED s allume HORS de l application : aucun theme ne s y applique.
        lightColor: '#8B5CF6',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
      console.log('\x1b[32m[API→Expo] getExpoPushTokenAsync REQUEST\x1b[0m');
      const t0 = Date.now();
      token = (await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID })).data;
      console.log('\x1b[34m[API←Expo] getExpoPushTokenAsync RESPONSE\x1b[0m', {
        ms: Date.now() - t0,
        tokenPreview: token ? `${String(token).slice(0, 20)}…` : null,
      });

      if (token && typeof token === 'string') {
        console.log('\x1b[32m[API→Firestore] users/updatePushToken REQUEST\x1b[0m', {
          email, tokenPreview: token.slice(0, 20) + '…',
        });
        await updatePushToken(email, token);
        console.log('\x1b[34m[API←Firestore] users/updatePushToken OK\x1b[0m');
      }

      // Token FCM NATIF (getDevicePushTokenAsync) → envoi push DIRECT via
      // firebase-admin côté serveur, sans dépendre d'Expo Push / EAS.
      try {
        const dev = await Notifications.getDevicePushTokenAsync();
        if (dev && typeof dev.data === 'string') {
          await updateFcmToken(email, dev.data);
          console.log('\x1b[34m[FCM] device token enregistré\x1b[0m', String(dev.data).slice(0, 18) + '…');
        }
      } catch (e: any) {
        console.log('\x1b[33m[FCM] getDevicePushTokenAsync KO\x1b[0m', e?.message);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  static async scheduleReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const config = await getAdminNotificationConfig();

    // SDK 52 : 'daily' = rappel quotidien à heure:minute (repeats implicite).
    // L'ancien 'calendar' ne planifiait AUCUNE alarme sur Android 14 (0 rappel).
    const triggerOptions = {
        type: 'daily' as any,
    };

    // Breakfast (8:00 AM) — message FR "intelligent" en fallback si config vide
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Petit-déjeuner ☀️",
        body: config.breakfast || "Logge ton petit-déjeuner pour bien démarrer 🍳",
      },
      trigger: {
        ...triggerOptions,
        hour: 8,
        minute: 0,
      } as any,
    });

    // Lunch (1:00 PM)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Déjeuner 🥗",
        body: config.lunch || "C'est l'heure ! Logge ton déjeuner.",
      },
      trigger: {
        ...triggerOptions,
        hour: 13,
        minute: 0,
      } as any,
    });

    // Dinner (7:00 PM)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Dîner 🍲",
        body: config.dinner || "Logge ton dîner avant de te détendre.",
      },
      trigger: {
        ...triggerOptions,
        hour: 19,
        minute: 0,
      } as any,
    });

    // Daily Encouragement (11:00 AM)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Reste actif ! ⚡",
        body: config.encouragement || "Petit pas du jour : bouge un peu et logge ton repas 💪",
      },
      trigger: {
        ...triggerOptions,
        hour: 11,
        minute: 0,
      } as any,
    });

    // Rappels d'hydratation "bois de l'eau" (15h et 17h) — additif
    for (const h of [15, 17]) {
      await Notifications.scheduleNotificationAsync({
        content: { title: "Hydratation 💧", body: "Bois de l'eau pour rester sur ton objectif." },
        trigger: { ...triggerOptions, hour: h, minute: 0 } as any,
      });
    }
  }

  static setupListeners(email: string) {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      saveNotificationToHistory(email, notification);
    });
    return subscription;
  }
}
