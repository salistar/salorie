// Ecran camera INLINE (vue RN) — remplace ImagePicker.launchCameraAsync
// qui lance un Intent Android et fait tuer l activite RN par l OS en Expo Go.
// Ici la camera est un composant RN, pas d Intent, pas de kill, pas de reload.
import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Circle, RotateCw } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { colorLog, explain } from '../lib/LocalDataStore';

const PENDING_SCAN_KEY = 'pending_scan_v1';

export default function ScanCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    console.log('\x1b[33m[scan-camera] mount — permission status:\x1b[0m', permission?.status);
  }, []);

  useEffect(() => {
    // Demande auto de la permission a l'ouverture de l ecran
    if (permission && !permission.granted && permission.canAskAgain) {
      console.log('\x1b[33m[scan-camera] pas de permission — on la demande\x1b[0m');
      requestPermission();
    }
  }, [permission]);

  if (!permission) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionWrap}>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionText}>
          We need camera access to scan your food photos.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.permissionBtn, { backgroundColor: Colors.light.gray[200] }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.permissionBtnText, { color: Colors.light.gray[900] }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    explain('prise photo INLINE (pas d Intent camera systeme) — l activite RN reste vivante');
    colorLog('GREEN', '[API→expo-camera] takePictureAsync REQUEST', { quality: 0.3 });
    const t0 = Date.now();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: false,
        exif: false,
        skipProcessing: true, // evite une 2e passe CPU/memoire
      });
      colorLog('BLUE', '[API←expo-camera] takePictureAsync RESPONSE', {
        ms: Date.now() - t0,
        uri: photo?.uri,
        width: photo?.width,
        height: photo?.height,
      });

      if (!photo?.uri) {
        Alert.alert('Capture failed', 'Could not take the photo. Try again.');
        setCapturing(false);
        return;
      }

      // Persistance URI (au cas ou le navigateur / nav serait lent)
      try {
        await AsyncStorage.setItem(
          PENDING_SCAN_KEY,
          JSON.stringify({ uri: photo.uri, at: Date.now() })
        );
        colorLog('RED', '[API→AsyncStorage] pending_scan SAVE', {
          uri: photo.uri,
          key: PENDING_SCAN_KEY,
        });
      } catch (e) {
        console.warn('[scan-camera] pending_scan save failed', e);
      }

      // Navigation vers analyse Gemini
      router.replace({
        pathname: '/scan-analysis' as any,
        params: { imageUri: photo.uri },
      });
    } catch (e: any) {
      console.warn('[scan-camera] capture failed:', e?.message);
      Alert.alert('Capture error', e?.message || 'Unknown error');
      setCapturing(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        // Reglages memoire-friendly : pas de video, pas d audio
        mode="picture"
      >
        {/* Overlay UI */}
        <View style={styles.overlay}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.back()}
              disabled={capturing}
            >
              <X size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Scan Food</Text>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              disabled={capturing}
            >
              <RotateCw size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom bar : shutter */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.shutter, capturing && styles.shutterDisabled]}
              onPress={handleCapture}
              disabled={capturing}
              activeOpacity={0.7}
            >
              {capturing ? (
                <ActivityIndicator color={Colors.light.primary} size="large" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>
            <Text style={styles.hint}>
              {capturing ? 'Processing…' : 'Tap to capture'}
            </Text>
          </View>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Colors.light.primary,
  },
  hint: {
    color: '#fff',
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#000',
  },
  loadingText: { color: '#fff', fontSize: 14 },
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    backgroundColor: '#000',
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionText: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  permissionBtn: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
