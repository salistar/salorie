import React from 'react';
import { FlatList, FlatListProps } from 'react-native';

/**
 * Liste virtualisée pour les écrans à contenu non borné.
 *
 * POURQUOI CE FICHIER EXISTE. Ces écrans utilisaient `FlashList` de Shopify. Depuis la
 * version 2, FlashList refuse de se charger hors « nouvelle architecture » React Native
 * et lève une erreur FATALE au chargement du module :
 *
 *     Error: FlashList v2 is only supported on new architecture
 *
 * Ce n'est pas une dégradation silencieuse : l'application entière meurt à l'ouverture de
 * l'écran. Constaté sur appareil le 4 août 2026 — les six écrans concernés tuaient l'app.
 * Salorie tourne délibérément en architecture historique (`newArchEnabled: false`), choix
 * fait à la migration SDK 54 pour rester sur Reanimated 3.
 *
 * `FlatList` virtualise elle aussi : elle ne recycle pas les vues comme FlashList, mais
 * elle ne monte que la fenêtre visible plus une marge. C'est très largement suffisant ici
 * (listes de l'ordre de la centaine d'éléments) et cela ne dépend d'aucun module natif.
 *
 * LE JOUR OÙ L'APP PASSERA À LA NOUVELLE ARCHITECTURE, il suffira de réécrire ce seul
 * fichier pour revenir à FlashList : les six écrans n'ont pas à être retouchés.
 */
export function PerfList<T>(props: FlatListProps<T>) {
  return (
    <FlatList
      // Fenêtre volontairement modeste : ces écrans montent des cartes riches (images,
      // ombres). Un windowSize par défaut de 21 écrans ferait travailler le fil JS pour
      // du contenu que personne ne regarde.
      windowSize={7}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      {...props}
    />
  );
}

export default PerfList;
