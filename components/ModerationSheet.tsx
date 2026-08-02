// Feuille de modération UGC réutilisable — Signaler (motifs) + Bloquer + Annuler.
// Exigence Google Play (contenu utilisateur). Utilisée sur le fil social + le marketplace.
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Flag, Ban, X, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { reportContent, blockUser, REPORT_REASONS, ReportReason, ReportTargetType } from '../lib/moderation';

const TXT: any = {
  en: {
    title: 'Report or block', reason_q: 'Why are you reporting this?',
    report: 'Report content', block: (n: string) => `Block ${n || 'this user'}`, cancel: 'Cancel',
    reported: 'Reported. Thanks — our team will review it.', blocked: 'Blocked. You won’t see their content.',
    failed: 'Something went wrong. Try again.',
    reasons: { spam: 'Spam', inappropriate: 'Inappropriate / offensive', harassment: 'Harassment or bullying', scam: 'Scam or fraud', false_info: 'False information', other: 'Other' },
  },
  fr: {
    title: 'Signaler ou bloquer', reason_q: 'Pourquoi le signales-tu ?',
    report: 'Signaler le contenu', block: (n: string) => `Bloquer ${n || 'cet utilisateur'}`, cancel: 'Annuler',
    reported: 'Signalé. Merci — notre équipe va vérifier.', blocked: 'Bloqué. Tu ne verras plus son contenu.',
    failed: 'Une erreur est survenue. Réessaie.',
    reasons: { spam: 'Spam', inappropriate: 'Inapproprié / offensant', harassment: 'Harcèlement', scam: 'Arnaque ou fraude', false_info: 'Fausse information', other: 'Autre' },
  },
  ar: {
    title: 'إبلاغ أو حظر', reason_q: 'لماذا تبلّغ عن هذا؟',
    report: 'الإبلاغ عن المحتوى', block: (n: string) => `حظر ${n || 'هذا المستخدم'}`, cancel: 'إلغاء',
    reported: 'تم الإبلاغ. شكرًا — سيراجعه فريقنا.', blocked: 'تم الحظر. لن ترى محتواه.',
    failed: 'حدث خطأ. حاول مجددًا.',
    reasons: { spam: 'رسائل مزعجة', inappropriate: 'غير لائق / مسيء', harassment: 'تحرّش أو تنمّر', scam: 'احتيال', false_info: 'معلومات خاطئة', other: 'أخرى' },
  },
};

export default function ModerationSheet({
  visible, onClose, targetType, targetId, targetOwnerDocId, targetName, reporterEmail, onBlocked, onReported,
}: {
  visible: boolean; onClose: () => void;
  targetType: ReportTargetType; targetId: string; targetOwnerDocId?: string; targetName?: string;
  reporterEmail: string;
  onBlocked?: (ownerDocId: string) => void; onReported?: () => void;
}) {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const [step, setStep] = useState<'menu' | 'reasons'>('menu');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>('');

  const sheetBg = isDark ? '#161C23' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const line = isDark ? '#283241' : '#EEF2F6';

  const reset = () => { setStep('menu'); setBusy(false); setDone(''); };
  const close = () => { reset(); onClose(); };

  const doReport = async (reason: ReportReason) => {
    setBusy(true);
    const ok = await reportContent(reporterEmail, { targetType, targetId, targetOwnerDocId, reason });
    setBusy(false);
    setDone(ok ? t.reported : t.failed);
    setTimeout(() => { close(); onReported?.(); }, 1400);
  };

  const doBlock = async () => {
    if (!targetOwnerDocId) { close(); return; }
    setBusy(true);
    const ok = await blockUser(reporterEmail, targetOwnerDocId, targetName);
    setBusy(false);
    setDone(ok ? t.blocked : t.failed);
    setTimeout(() => { close(); if (ok) onBlocked?.(targetOwnerDocId); }, 1200);
  };

  const row = (icon: React.ReactNode, label: string, onPress: () => void, danger = false) => (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.7}
      style={[styles.row, { borderColor: line }, isRTL && { flexDirection: 'row-reverse' }]}>
      {icon}
      <Text style={[styles.rowTxt, { color: danger ? '#DC2626' : text, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: sheetBg }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
            {step === 'reasons' ? (
              <TouchableOpacity onPress={() => setStep('menu')} hitSlop={10}><ChevronLeft size={22} color={sub} /></TouchableOpacity>
            ) : <View style={{ width: 22 }} />}
            <Text style={[styles.title, { color: text }]}>{step === 'reasons' ? t.reason_q : t.title}</Text>
            <TouchableOpacity onPress={close} hitSlop={10}><X size={22} color={sub} /></TouchableOpacity>
          </View>

          {done ? (
            <Text style={[styles.done, { color: text }]}>{done}</Text>
          ) : busy ? (
            <ActivityIndicator color="#2E8B57" style={{ paddingVertical: 24 }} />
          ) : step === 'menu' ? (
            <>
              {row(<Flag size={20} color="#D97706" strokeWidth={2.4} />, t.report, () => setStep('reasons'))}
              {targetOwnerDocId ? row(<Ban size={20} color="#DC2626" strokeWidth={2.4} />, t.block(targetName || ''), doBlock, true) : null}
              <TouchableOpacity onPress={close} style={styles.cancel}><Text style={[styles.cancelTxt, { color: sub }]}>{t.cancel}</Text></TouchableOpacity>
            </>
          ) : (
            <>
              {REPORT_REASONS.map((r) => row(<Flag size={18} color="#94a3b8" strokeWidth={2.2} />, t.reasons[r], () => doReport(r)))}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, borderBottomWidth: 1 },
  rowTxt: { fontSize: 15, fontWeight: '700', flex: 1 },
  cancel: { paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  cancelTxt: { fontSize: 15, fontWeight: '800' },
  done: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 26, paddingHorizontal: 8 },
});
