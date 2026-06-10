// Layout du groupe (app)/ : enveloppe les écrans poussés avec une barre de
// navigation persistante (PersistentTabBar). Le groupe (app) est TRANSPARENT dans
// l'URL → les routes ne changent pas (/fasting reste /fasting). paddingBottom laisse
// la place à la barre (pas de chevauchement avec le contenu).
import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import PersistentTabBar from '../../components/PersistentTabBar';

export default function AppGroupLayout() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingBottom: 70 }}>
        <Slot />
      </View>
      <PersistentTabBar />
    </View>
  );
}
