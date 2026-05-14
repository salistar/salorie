import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ShieldCheck, Fingerprint } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.light.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <View style={styles.iconHero}>
            <ShieldCheck size={64} color="#10B981" />
          </View>
          <Text style={styles.title}>Your Privacy Matters</Text>
          <Text style={styles.date}>Last Updated: April 15, 2026</Text>

          <Text style={styles.paragraph}>
            At Salorie, your privacy is our top priority. We implement industry-leading security measures to ensure your health journey remains private and secure.
          </Text>

          <View style={styles.infoBox}>
             <Fingerprint size={24} color="#10B981" />
             <Text style={styles.infoBoxText}>We use end-to-end encryption for all user logs and profile data stored in Firestore.</Text>
          </View>

          <Text style={styles.subTitle}>What We Collect</Text>
          <Text style={styles.paragraph}>
            We only collect information necessary for the app's functionality: profile details (handled by Clerk), nutritional targets, and daily meal/activity logs.
          </Text>

          <Text style={styles.subTitle}>Security</Text>
          <Text style={styles.paragraph}>
            Your data is hosted on secure Firebase infrastructure and protected by Clerk's enterprise-grade authentication system.
          </Text>

          <Text style={styles.subTitle}>Control</Text>
          <Text style={styles.paragraph}>
            You can delete your account and all associated data at any time through our support channel.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.white,
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
    backgroundColor: Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[900],
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  iconHero: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.light.gray[900],
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    color: Colors.light.gray[400],
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    gap: 16,
    marginVertical: 10,
    alignItems: 'center',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 20,
  },
  subTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.gray[800],
    marginTop: 24,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 16,
    color: Colors.light.gray[500],
    lineHeight: 24,
    fontWeight: '500',
  },
});
