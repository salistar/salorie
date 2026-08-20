// Layout du groupe (app)/ : enveloppe les écrans poussés avec une barre de
// navigation persistante (PersistentTabBar). Le groupe (app) est TRANSPARENT dans
// l'URL → les routes ne changent pas (/fasting reste /fasting).
//
// La place laissée sous le contenu VIENT DU SYSTÈME et non d'une constante. Elle
// valait 70 px en dur, ce qui suffisait tant que la barre restait basse — mais la
// barre était alors à moitié cachée derrière la navigation d'Android. En la
// remontant à sa juste place, elle est passée à 111 px d'occupation et mordait sur
// le contenu : la légende du déclencheur de l'écran de scan s'est retrouvée
// tranchée. Constaté sur R83L20HWJTE le 16 août 2026.
//
// Un seul endroit pour les 94 écrans du groupe, y compris ceux en plein écran
// (caméra, réalité augmentée) qui n'ont pas de conteneur de défilement où poser
// une marge.
import React from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import PersistentTabBar, { useBarreVisible } from '../../components/PersistentTabBar';
import { useEspaceBasSimple } from '../../lib/espaceBas';

export default function AppGroupLayout() {
  const espaceBas = useEspaceBasSimple();
  // La place n'est reservee que si la barre est REELLEMENT rendue. Sinon, les
  // ecrans d'avant-connexion (welcome) perdaient ~129 dp au profit d'une barre
  // absente — l'accueil coupait son troisieme argument faute de hauteur.
  const barreVisible = useBarreVisible();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingBottom: barreVisible ? espaceBas : 0 }}>
        <Slot />
      </View>
      <PersistentTabBar />
    </View>
  );
}
