import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Utensils, Zap, Droplets, ClipboardList, Check, Footprints, Weight, Flame } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { NutritionLog } from '../lib/firebase';
import { useTranslation } from '../lib/i18n';
import { translate } from '../lib/translator';
import { useTheme } from '../lib/ThemeContext';

interface ActivityListProps {
  logs: NutritionLog[];
  onAddPress?: () => void;
}

export default function ActivityList({ logs, onAddPress }: ActivityListProps) {
  const { t, language } = useTranslation();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const titleColor = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const itemBg = isDark ? '#161C23' : Colors.light.white;
  const itemBorder = isDark ? 'rgba(255,255,255,0.08)' : Colors.light.gray[50];
  const nameColor = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const valueColor = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const emptyBg = isDark ? 'rgba(255,255,255,0.04)' : Colors.light.gray[50];
  const subColor = isDark ? '#94a3b8' : Colors.light.gray[400];
  const tsColor = isDark ? '#64748b' : Colors.light.gray[300];
  // Perf : on est DANS le ScrollView du Home (FlatList imbriquée interdite) →
  // rendu plafonné + « voir plus » incrémental pour éviter 100+ items montés.
  const [visibleCount, setVisibleCount] = useState(30);

  // Cache of log.id → localized name. Names are first looked up in the i18n
  // dictionary (activities.<Name>); missing entries fall back to a Gemini
  // translation call which is then cached both locally and in Firestore.
  const [translatedNames, setTranslatedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (language === 'en') { setTranslatedNames({}); return; }
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const log of logs) {
        if (log.type !== 'activity' || !log.name) continue;
        const localKey = `activities.${log.name}` as any;
        const localVal = t(localKey);
        // If i18n returned the key itself, there was no local match — go to AI.
        const name = (localVal && localVal !== localKey)
          ? localVal
          : await translate(log.name, language as any);
        updates[log.id || log.name] = name;
      }
      if (!cancelled) setTranslatedNames(updates);
    })();
    return () => { cancelled = true; };
  }, [logs, language, t]);

  const localizedName = (log: NutritionLog) => {
    if (log.type !== 'activity') return log.name;
    return translatedNames[log.id || log.name] || log.name;
  };

  const localizedIntensity = (intensity?: string) => {
    if (!intensity) return '';
    const k = `activities.intensity.${intensity}` as any;
    const v = t(k);
    return v && v !== k ? v : intensity;
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return t('home.just_now');

    // Check if it's a Firestore Timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date((timestamp.seconds || 0) * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderIcon = (log: NutritionLog) => {
    if (log.type === 'meal') {
      return <View style={[styles.iconBox, { backgroundColor: '#FFEEED', width: 60, height: 60, borderRadius: 20 }]}><Utensils size={28} color="#FF5C5C" /></View>;
    }
    if (log.type === 'water') {
      return <View style={[styles.iconBox, { backgroundColor: '#F0FDF4', width: 60, height: 60, borderRadius: 20 }]}><Droplets size={28} color="#22C55E" /></View>;
    }
    
    // Exercise Icons
    let Icon = Zap;
    let bg = '#E0F2FE';
    let color = '#0EA5E9';

    if (log.name.toLowerCase().includes('run')) {
      Icon = Footprints;
      bg = '#EEF2FF';
      color = '#6366F1';
    } else if (log.name.toLowerCase().includes('lifting')) {
      Icon = Weight;
      bg = '#F5F3FF';
      color = '#8B5CF6';
    } else if (log.type === 'activity') {
      Icon = Flame;
      bg = '#FFF1F2';
      color = '#F43F5E';
    }

    return <View style={[styles.iconBox, { backgroundColor: bg, width: 60, height: 60, borderRadius: 20 }]}><Icon size={28} color={color} /></View>;
  };

  const renderEmptyState = () => (
    <View style={[styles.emptyState, { backgroundColor: emptyBg }]}>
      <View style={styles.emptyIconWrapper}>
        <ClipboardList size={40} color={Colors.light.primary} strokeWidth={2} />
      </View>
      <Text style={[styles.emptyTitle, { color: isDark ? '#f1f5f9' : Colors.light.gray[800] }]}>{t('home.no_activity')}</Text>
      <Text style={styles.emptySub}>{t('home.add_first')}</Text>

      <TouchableOpacity style={styles.addCta} onPress={onAddPress} activeOpacity={0.8}>
        <Check size={18} color={Colors.light.white} strokeWidth={3} />
        <Text style={styles.addCtaText}>+</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: titleColor }]}>{t('home.recent_activity')}</Text>

      {logs.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={styles.list}>
          {logs.slice(0, visibleCount).map((log, index) => (
            <View key={log.id || index} style={[styles.item, { backgroundColor: itemBg, borderColor: itemBorder }]}>
              <Text style={[styles.itemTimestamp, { color: tsColor }]}>{formatTime(log.timestamp)}</Text>

              <View style={styles.left}>
                {renderIcon(log)}
                <View style={styles.details}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    {(log as any).note?.grade ? (
                      <View style={[styles.gradeBadge, { backgroundColor: (log as any).note.color || '#2E8B57' }]}>
                        <Text style={styles.gradeTxt}>{(log as any).note.grade}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.name, { color: nameColor, flexShrink: 1 }]} numberOfLines={1}>{localizedName(log)}</Text>
                  </View>
                  {log.type === 'activity' && (log.intensity || log.duration) ? (
                    <Text style={[styles.subtext, { color: subColor }]}>
                      {localizedIntensity(log.intensity)} • {log.duration} min
                    </Text>
                  ) : log.type === 'meal' ? (
                    <Text style={[styles.subtext, { color: subColor }]}>
                      {Math.round(log.calories)} kcal {log.serving ? `• ${log.serving}` : ''}
                    </Text>
                  ) : log.type === 'water' ? (
                    <Text style={[styles.subtext, { color: subColor }]}>
                      {t('home.hydration_log')}
                    </Text>
                  ) : (
                    <Text style={[styles.subtext, { color: subColor }]}>{log.type.charAt(0).toUpperCase() + log.type.slice(1)}</Text>
                  )}
                  {(log as any).description ? (
                    <Text style={[styles.descLine, { color: subColor }]} numberOfLines={2}>{(log as any).description}</Text>
                  ) : null}
                </View>
              </View>
              
              <View style={styles.right}>
                <Text style={[
                  styles.value,
                  { color: valueColor },
                  log.type === 'activity' && styles.activityValue
                ]}>
                  {log.type === 'activity' ? '-' : ''}
                  {log.type === 'water' ? `${Math.round(log.calories)} ml` : `${Math.round(log.calories)} kcal`}
                </Text>
              </View>
            </View>
          ))}
          {logs.length > visibleCount && (
            <TouchableOpacity onPress={() => setVisibleCount((c) => c + 30)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: Colors.light.primary, fontWeight: '700', fontSize: 13 }}>
                + {Math.min(30, logs.length - visibleCount)} {language === 'fr' ? 'de plus' : language === 'ar' ? 'المزيد' : 'more'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.gray[900],
    letterSpacing: -0.5,
    marginBottom: 20,
    paddingHorizontal: 2,
  },
  list: {
    gap: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.white,
    padding: 18,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.light.gray[50],
  },
  itemTimestamp: {
    position: 'absolute',
    top: 14,
    right: 18,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.gray[300],
    textTransform: 'uppercase',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.light.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.light.gray[900],
    marginBottom: 4,
  },
  subtext: {
    fontSize: 13,
    color: Colors.light.gray[400],
    fontWeight: '600',
  },
  gradeBadge: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gradeTxt: { color: '#fff', fontSize: 12.5, fontWeight: '900' },
  descLine: { fontSize: 11.5, fontWeight: '500', marginTop: 4, lineHeight: 15.5, opacity: 0.9 },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 18, // Push down to avoid overlapping timestamp
  },
  value: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.light.gray[900],
    letterSpacing: -0.5,
  },
  activityValue: {
    color: '#10B981', // green for burned calories representation sometimes, or just stick to black
  },
  macrosPreview: {
    fontSize: 12,
    color: Colors.light.gray[400],
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'transparent',
    borderStyle: 'dashed',
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.light.gray[400],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[800],
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.light.gray[400],
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
    fontWeight: '500',
  },
  addCta: {
    marginTop: 24,
    backgroundColor: Colors.light.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addCtaText: {
    color: Colors.light.white,
    fontSize: 15,
    fontWeight: '800',
  },
});
