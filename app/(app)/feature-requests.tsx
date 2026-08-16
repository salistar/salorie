import React, { useState, useEffect, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import {
  ChevronLeft,
  Plus,
  ArrowBigUp,
  ArrowBigUpDash,
  Lightbulb,
  X
} from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormInput, SubmitBar } from '../../components/FormKit';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  userId: string;
  userName: string;
  upvotes: string[];
  createdAt: any;
}

export default function FeatureRequestsScreen() {
  const { user } = useUser();
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tPrimary = isDark ? '#fff' : Colors.light.gray[900];
  const tMuted = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const cardBorder = isDark ? '#283241' : Colors.light.gray[100];
  const upvoteBg = isDark ? '#0f1419' : Colors.light.white;
  const FL = ({
    en: { board: 'Feature Board', shape: 'Shape the Future', vote: 'Vote for features you want to see or suggest your own.', empty: 'No requests yet. Be the first!', by: 'by', newTitle: 'New idea', fTitle: 'Title', fTitlePh: "What's your idea?", fDesc: 'Description', fDescPh: 'How would it work?', submit: 'Submit Request', okTitle: 'Thank you!', okMsg: 'Your idea was added. The community can now upvote it.' },
    fr: { board: 'Idées & votes', shape: 'Façonnez le futur', vote: 'Votez pour les fonctionnalités souhaitées ou proposez les vôtres.', empty: "Aucune demande pour l'instant. Soyez le premier !", by: 'par', newTitle: 'Nouvelle idée', fTitle: 'Titre', fTitlePh: 'Quelle est votre idée ?', fDesc: 'Description', fDescPh: 'Comment ça marcherait ?', submit: 'Envoyer la demande', okTitle: 'Merci !', okMsg: 'Votre idée a été ajoutée. La communauté peut maintenant voter pour elle.' },
    ar: { board: 'لوحة الأفكار', shape: 'اصنع المستقبل', vote: 'صوّت على الميزات التي تريدها أو اقترح ميزتك.', empty: 'لا توجد طلبات بعد. كن الأول!', by: 'بواسطة', newTitle: 'فكرة جديدة', fTitle: 'العنوان', fTitlePh: 'ما هي فكرتك؟', fDesc: 'الوصف', fDescPh: 'كيف ستعمل؟', submit: 'إرسال الطلب', okTitle: 'شكراً لك!', okMsg: 'تمت إضافة فكرتك. يمكن للمجتمع الآن التصويت لها.' },
  } as any)[String(language)] || { board: 'Feature Board', shape: 'Shape the Future', vote: 'Vote for features you want to see or suggest your own.', empty: 'No requests yet. Be the first!', by: 'by', newTitle: 'New idea', fTitle: 'Title', fTitlePh: "What's your idea?", fDesc: 'Description', fDescPh: 'How would it work?', submit: 'Submit Request', okTitle: 'Thank you!', okMsg: 'Your idea was added. The community can now upvote it.' };
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newFeature, setNewFeature] = useState({ title: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequests = async () => {
    try {
      let snapshot;
      try {
        // tri par date — exclut les docs sans createdAt
        snapshot = await getDocs(query(collection(db, 'feature_requests'), orderBy('createdAt', 'desc')));
      } catch {
        snapshot = null;
      }
      // repli : tout récupérer (docs sans createdAt inclus) puis trier en mémoire
      if (!snapshot || snapshot.empty) {
        snapshot = await getDocs(collection(db, 'feature_requests'));
      }
      const data = snapshot.docs
        // Le type dit ce qui est vrai : les documents anciens n'ont pas forcement le
        // champ `upvotes`, d'ou le `?` — sans lui le defaut ci-dessous serait du code
        // mort. Et `id` vient du document, jamais d'un champ stocke.
        .map(doc => {
          const d = doc.data() as Omit<FeatureRequest, 'id' | 'upvotes'> & { upvotes?: string[] };
          return { ...d, upvotes: d.upvotes ?? [], id: doc.id };
        })
        .sort((a: any, b: any) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setRequests(data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAddFeature = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email || !newFeature.title.trim() || !newFeature.description.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feature_requests'), {
        title: newFeature.title,
        description: newFeature.description,
        userId: email,
        userName: user.fullName || 'Anonymous',
        upvotes: [],
        createdAt: serverTimestamp()
      });
      setIsModalVisible(false);
      setNewFeature({ title: '', description: '' });
      fetchRequests();
      Alert.alert(FL.okTitle, FL.okMsg);
    } catch (error) {
      console.error('Error adding feature:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUpvote = async (requestId: string, currentUpvotes: string[]) => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    const hasUpvoted = currentUpvotes.includes(email);
    const requestRef = doc(db, 'feature_requests', requestId);

    try {
      // Optimistic UI update
      setRequests(prev => prev.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            upvotes: hasUpvoted
              ? req.upvotes.filter(id => id !== email)
              : [...req.upvotes, email]
          };
        }
        return req;
      }));

      await updateDoc(requestRef, {
        upvotes: hasUpvoted ? arrayRemove(email) : arrayUnion(email)
      });
    } catch (error) {
      console.error('Error upvoting:', error);
      fetchRequests(); // Rollback on error
    }
  };

  const RequestCard = ({ item, index }: { item: FeatureRequest, index: number }) => {
    const hasUpvoted = item.upvotes.includes(user?.primaryEmailAddress?.emailAddress || '');
    return (
      <Animated.View
        entering={FadeInDown.delay(index * 100).duration(600)}
        style={[styles.card, { flexDirection: rowDir(isRTL), backgroundColor: cardBg, borderColor: cardBorder }]}
      >
        <View style={styles.cardMain}>
          <Text style={[styles.cardTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{item.title}</Text>
          <Text style={[styles.cardDesc, { color: tMuted, textAlign: txtAlign(isRTL) }]}>{item.description}</Text>
          <View style={styles.cardFooter}>
            <Text style={[styles.authorText, { textAlign: txtAlign(isRTL) }]}>{FL.by} {item.userName}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.upvoteSection,
            { backgroundColor: upvoteBg, borderColor: cardBorder, marginLeft: isRTL ? 0 : 16, marginRight: isRTL ? 16 : 0 },
            hasUpvoted && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          onPress={() => toggleUpvote(item.id, item.upvotes)}
        >
          {hasUpvoted ? <ArrowBigUpDash size={28} color={Colors.light.white} /> : <ArrowBigUp size={28} color={colors.primary} />}
          <Text style={[styles.upvoteCount, { color: colors.primary }, hasUpvoted && styles.upvoteCountActive]}>{item.upvotes.length}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: resolved === 'dark' ? '#0f1419' : Colors.light.white }]}>
      <ScreenTopBar showBack title={FL.board} showBrand={false} showNotif={false} />

      <View style={styles.topInfo}>
        <Text style={[styles.title, { color: tPrimary }]}>{FL.shape}</Text>
        <Text style={[styles.subtitle, { color: tMuted }]}>{FL.vote}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {requests.map((item, index) => (
            <RequestCard key={item.id} item={item} index={index} />
          ))}
          
          {requests.length === 0 && (
            <View style={styles.emptyState}>
              <Lightbulb size={48} color={isDark ? '#283241' : Colors.light.gray[200]} />
              <Text style={[styles.emptyText, { color: tMuted }]}>{FL.empty}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: colors.primary },
          isDark && { shadowOpacity: 0, elevation: 0 },
        ]}
        onPress={() => setIsModalVisible(true)}
      >
        <Plus color={Colors.light.white} size={32} />
      </TouchableOpacity>

      {/* Add Feature Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInUp.duration(400)} style={[styles.modalContent, { backgroundColor: isDark ? '#161C23' : Colors.light.white }]}>
            <View style={[styles.modalHeader, { flexDirection: rowDir(isRTL) }]}>
              <Text style={[styles.modalTitle, { color: tPrimary }]}>{FL.newTitle}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('fermer')} onPress={() => setIsModalVisible(false)}>
                <X size={24} color={isDark ? '#9BA1A6' : Colors.light.gray[400]} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <FormInput
                label={FL.fTitle}
                placeholder={FL.fTitlePh}
                value={newFeature.title}
                onChangeText={(t: string) => setNewFeature({ ...newFeature, title: t })}
              />

              <FormInput
                label={FL.fDesc}
                placeholder={FL.fDescPh}
                multiline
                numberOfLines={4}
                style={{ height: 120, textAlignVertical: 'top' }}
                value={newFeature.description}
                onChangeText={(t: string) => setNewFeature({ ...newFeature, description: t })}
              />

              <View style={{ marginHorizontal: -24, marginTop: -8 }}>
                <SubmitBar label={FL.submit} onPress={handleAddFeature} loading={isSubmitting} />
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  topInfo: {
    padding: 24,
    paddingBottom: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '500',
    marginTop: 8,
    lineHeight: 22,
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  cardMain: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    lineHeight: 20,
    fontWeight: '500',
  },
  cardFooter: {
    marginTop: 12,
  },
  authorText: {
    fontSize: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '600',
  },
  upvoteSection: {
    width: 60,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    marginLeft: 16,
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  upvoteActive: {
    backgroundColor: Colors.light.primary,
    borderColor: isDark ? Colors.dark.primary : Colors.light.primary,
  },
  upvoteCount: {
    fontSize: 16,
    fontWeight: '900',
    color: isDark ? Colors.dark.primary : Colors.light.primary,
    marginTop: 4,
  },
  upvoteCountActive: {
    color: Colors.light.white,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: isDark ? Colors.dark.gray[300] : Colors.light.gray[300],
    fontWeight: '600',
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  modalBody: {
    gap: 2,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    marginLeft: 4,
  },
  input: {
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderRadius: 20,
    padding: 18,
    fontSize: 16,
    fontWeight: '600',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    borderWidth: 1.5,
    borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: Colors.light.primary,
    height: 60,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.white,
  },
});
