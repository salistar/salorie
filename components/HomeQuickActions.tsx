// Section "Lance-toi" en haut du Home : accès rapide aux courses virtuelles, courses
// de groupe et défis + raccourci notifications. Additif (composant autonome).
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Bell, MapPin, Users, Trophy, Sparkles } from 'lucide-react-native';

const GREEN = '#2E8B57';

const ACTIONS = [
  { icon: MapPin, label: 'Course virtuelle', route: '/races' },
  { icon: Users, label: 'Course de groupe', route: '/races' },
  { icon: Trophy, label: 'Défi géo', route: '/challenge' },
  { icon: Sparkles, label: 'Coach IA', route: '/ai-coach' },
];

export default function HomeQuickActions() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Bell size={16} color={GREEN} />
        <Text style={styles.title}>Lance-toi</Text>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)} hitSlop={8}>
          <Text style={styles.link}>Notifications</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <TouchableOpacity key={i} style={styles.chip} activeOpacity={0.85} onPress={() => router.push(a.route as any)}>
              <Icon size={18} color={GREEN} />
              <Text style={styles.chipTxt}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingLeft: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingRight: 16 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginLeft: 8, flex: 1 },
  link: { fontSize: 12, color: GREEN, fontWeight: '700' },
  row: { gap: 10, paddingRight: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EAF4EE', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  chipTxt: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
});
