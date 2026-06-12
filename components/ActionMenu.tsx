import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions, Alert } from 'react-native';
import { Zap, Droplets, Database, Scan, Crown, Mic, ScanBarcode, Scale } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useLogging } from '../lib/LoggingContext';
import { useTranslation } from '../lib/i18n';

const { width } = Dimensions.get('window');

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorLog, explain } from '../lib/LocalDataStore';

// Cle AsyncStorage : si Android tue l app pendant que la camera est ouverte,
// on retrouve l URI ici au redemarrage et on relance automatiquement
// l ecran scan-analysis. Sans ca, l utilisateur atterrit sur Home et sa
// photo est "perdue".
const PENDING_SCAN_KEY = 'pending_scan_v1';

export default function ActionMenu() {
  const { isActionMenuVisible, hideActionMenu, showLogModal, setScanImageBase64 } = useLogging();
  const { t, language } = useTranslation() as any;
  // Libellés des 3 nouvelles actions (pas de clés centrales) — trilingue local.
  const L: any = {
    en: { voice: 'Voice log', barcode: 'Barcode', weight: 'Weight' },
    fr: { voice: 'Vocal', barcode: 'Code-barres', weight: 'Poids' },
    ar: { voice: 'صوتي', barcode: 'باركود', weight: 'الوزن' },
  };
  const lx = L[language] || L.en;

  const handleScanFood = () => {
    Alert.alert(
      t('menu.scan_food'),
      t('menu.how_photo'),
      [
        {
          text: t('menu.take_photo'),
          onPress: () => {
            // FIX Expo Go reload : on NE lance PAS ImagePicker.launchCameraAsync
            // (qui fire un Intent Android → l OS kill l activite RN → reload JS).
            // A la place, on navigue vers /scan-camera qui utilise expo-camera
            // CameraView INLINE : pas d Intent, pas de kill, pas de reload.
            explain('navigation vers /scan-camera (camera inline RN) au lieu de launchCameraAsync Intent');
            colorLog('GREEN', '[Nav] router.push /scan-camera');
            hideActionMenu();
            router.push('/scan-camera' as any);
          },
        },
        {
          text: t('menu.gallery'),
          onPress: handleGalleryAction,
        },
        {
          text: t('menu.cancel'),
          style: 'cancel',
        },
      ]
    );
  };

  const handleCameraAction = async () => {
    console.log('\x1b[33m[ActionMenu] camera : demande de permission\x1b[0m');
    explain('on demande la permission camera au systeme Android — si refusee on affiche un Alert');
    colorLog('GREEN', '[API→Expo] requestCameraPermissionsAsync REQUEST');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    colorLog('BLUE', '[API←Expo] requestCameraPermissionsAsync RESPONSE', { status });
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera access to scan your food.');
      return;
    }

    // IMPORTANT : on NE demande PAS base64 ici — en Expo Go Bridgeless l OS
    // tue souvent l activite RN pendant que la camera est ouverte, et
    // ramener un string base64 de ~500 KB a travers le bridge au retour
    // fait crasher/reloader le JS. On se contente de l URI fichier et
    // scan-analysis lit le base64 a la demande via FileSystem.
    explain('ouverture camera : pas de base64, pas de crop (allowsEditing=false pour eviter la 2e activity qui double la memoire), quality basse — sinon Android Expo Go tue le JS et toute l app reload');
    console.log('\x1b[33m[ActionMenu] ouverture de la camera (mode memoire minimale)\x1b[0m');
    colorLog('GREEN', '[API→Expo] launchCameraAsync REQUEST', { quality: 0.3, allowsEditing: false });
    const t0 = Date.now();
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,   // ← enleve : evite une 2e activity de crop qui fait reloader Expo Go
      quality: 0.3,           // ← baisse : ~200KB au lieu de 500KB+ → moins de RAM, Gemini plus rapide
      exif: false,
      mediaTypes: ['images'] as any,
    });
    colorLog('BLUE', '[API←Expo] launchCameraAsync RESPONSE', {
      ms: Date.now() - t0,
      canceled: result.canceled,
      uri: result.canceled ? null : result.assets?.[0]?.uri,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      // NOTE : si tu vois "Android Bundled … entry.js" AVANT meme d arriver
      // ici, c est que Android a tue l app pendant la camera. C est une
      // limitation d Expo Go impossible a contourner en JS. Solution :
      // faire un dev-build avec `npx expo run:android`. Tant que tu restes
      // en Expo Go, le URI photo sera perdu au reload (meme AsyncStorage
      // ne le voit pas parce qu on n y arrive pas).
      explain('photo recue — on persiste l URI sur disque (pour le cas ou Android tuerait l app APRES ce point mais avant scan-analysis)');
      try {
        await AsyncStorage.setItem(PENDING_SCAN_KEY, JSON.stringify({ uri, at: Date.now() }));
        colorLog('RED', '[API→AsyncStorage] pending_scan SAVE', { uri, key: PENDING_SCAN_KEY });
      } catch (e) {
        console.warn('[ActionMenu] pending_scan save failed', e);
      }
      setScanImageBase64(null);
      hideActionMenu();
      router.push({
        pathname: '/scan-analysis' as any,
        params: { imageUri: uri }
      });
    } else {
      console.log('\x1b[33m[ActionMenu] prise de photo annulee\x1b[0m');
    }
  };

  const handleGalleryAction = async () => {
    console.log('\x1b[33m[ActionMenu] galerie : demande de permission\x1b[0m');
    colorLog('GREEN', '[API→Expo] requestMediaLibraryPermissionsAsync REQUEST');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    colorLog('BLUE', '[API←Expo] requestMediaLibraryPermissionsAsync RESPONSE', { status });
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need gallery access to select food images.');
      return;
    }

    // Meme raison que pour la camera : pas de base64 inline.
    explain('ouverture galerie : meme strategie que camera — pas de crop, quality basse, pas de base64 inline');
    colorLog('GREEN', '[API→Expo] launchImageLibraryAsync REQUEST', { quality: 0.3, allowsEditing: false });
    const t0 = Date.now();
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.3,
      exif: false,
      mediaTypes: ['images'] as any,
    });
    colorLog('BLUE', '[API←Expo] launchImageLibraryAsync RESPONSE', {
      ms: Date.now() - t0,
      canceled: result.canceled,
      uri: result.canceled ? null : result.assets?.[0]?.uri,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      try {
        await AsyncStorage.setItem(PENDING_SCAN_KEY, JSON.stringify({ uri, at: Date.now() }));
        colorLog('RED', '[API→AsyncStorage] pending_scan SAVE', { uri, key: PENDING_SCAN_KEY });
      } catch (e) {
        console.warn('[ActionMenu] pending_scan save failed', e);
      }
      setScanImageBase64(null);
      hideActionMenu();
      router.push({
        pathname: '/scan-analysis' as any,
        params: { imageUri: uri }
      });
    } else {
      console.log('\x1b[33m[ActionMenu] selection galerie annulee\x1b[0m');
    }
  };

  const actions = [
    {
      id: 'exercise',
      title: t('menu.log_exercise'),
      icon: <Zap size={24} color="#0EA5E9" />,
      bg: '#E0F2FE',
      onPress: () => {
        hideActionMenu();
        router.push('/log-exercise' as any);
      },
    },
    {
      id: 'water',
      title: t('menu.add_water'),
      icon: <Droplets size={24} color="#22C55E" />,
      bg: '#F0FDF4',
      onPress: () => {
        hideActionMenu();
        router.push('/add-water' as any);
      },
    },
    {
      id: 'database',
      title: t('menu.food_database'),
      icon: <Database size={24} color="#F59E0B" />,
      bg: '#FFF9EB',
      onPress: () => {
        hideActionMenu();
        router.push('/food-database' as any);
      },
    },
    {
      id: 'scan',
      title: t('menu.scan_food'),
      icon: <Scan size={24} color="#FF5C5C" />,
      bg: '#FFEEED',
      premium: true,
      onPress: handleScanFood,
    },
    {
      id: 'voice',
      title: lx.voice,
      icon: <Mic size={24} color="#8B5CF6" />,
      bg: '#F3EEFF',
      onPress: () => { hideActionMenu(); router.push('/voice-log' as any); },
    },
    {
      id: 'barcode',
      title: lx.barcode,
      icon: <ScanBarcode size={24} color="#0E7490" />,
      bg: '#E0F7FA',
      onPress: () => { hideActionMenu(); router.push('/scan-barcode' as any); },
    },
    {
      id: 'weight',
      title: lx.weight,
      icon: <Scale size={24} color="#B45309" />,
      bg: '#FEF3E2',
      onPress: () => { hideActionMenu(); router.push('/update-weight' as any); },
    },
  ];

  if (!isActionMenuVisible) return null;

  return (
    <Modal
      visible={isActionMenuVisible}
      transparent
      animationType="fade"
      onRequestClose={hideActionMenu}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={hideActionMenu}
      >
        <View style={styles.container}>
          <View style={styles.grid}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={action.onPress}
              >
                <View style={[styles.iconBox, { backgroundColor: action.bg }]}>
                  {action.icon}
                  {action.premium && (
                    <View style={styles.premiumBadge}>
                      <Crown size={10} color={Colors.light.white} strokeWidth={3} />
                    </View>
                  )}
                </View>
                <Text style={styles.actionTitle}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)', // Lighter overlay for better transparency feel
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 110, // Adjusted slightly above FAB
  },
  container: {
    width: width - 40,
    backgroundColor: 'transparent',
    padding: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  card: {
    width: (width - 40 - 16 - 16) / 2, // Adjusted for gap and container padding
    aspectRatio: 1.1,
    backgroundColor: Colors.light.white,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  premiumBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F59E0B',
    padding: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.white,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.light.gray[900],
    textAlign: 'center',
  },
});
