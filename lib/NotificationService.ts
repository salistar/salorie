import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { updatePushToken, getAdminNotificationConfig, saveNotificationToHistory } from './firebase';

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
      token = (await Notifications.getExpoPushTokenAsync()).data;
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
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  static async scheduleReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const config = await getAdminNotificationConfig();

    const triggerOptions = {
        type: 'calendar' as any,
        repeats: true,
    };

    // Breakfast (8:00 AM)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Breakfast Reminder ☀️",
        body: config.breakfast,
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
        title: "Lunch Reminder 🥗",
        body: config.lunch,
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
        title: "Dinner Reminder 🍲",
        body: config.dinner,
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
        title: "Stay Active! ⚡",
        body: config.encouragement,
      },
      trigger: {
        ...triggerOptions,
        hour: 11,
        minute: 0,
      } as any,
    });
  }

  static setupListeners(email: string) {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      saveNotificationToHistory(email, notification);
    });
    return subscription;
  }
}
