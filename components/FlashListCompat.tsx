import { Animated, FlatList, FlatListProps } from 'react-native';

/**
 * Remplacement local de `@shopify/flash-list`, branché par le résolveur Metro
 * (voir metro.config.js).
 *
 * POURQUOI. FlashList 2 refuse de se charger hors « nouvelle architecture » React
 * Native et lève une erreur FATALE au chargement du module — l'application entière
 * meurt. Salorie tourne en architecture historique depuis la migration SDK 54.
 *
 * Nos écrans n'utilisent plus FlashList (voir PerfList.tsx), mais une dépendance le
 * fait encore : `react-native-ruler-picker`, qui l'importe dans ses propres sources
 * et vise la version 1. C'est ainsi que l'écran de MISE À JOUR DU POIDS plantait,
 * constaté sur appareil le 4 août 2026 — un écran qu'aucune recherche d'imports dans
 * notre code n'aurait signalé.
 *
 * Réinstaller FlashList 1.x aurait ramené un module natif conçu pour React Native
 * 0.7x. Ici, aucun code natif : `FlatList` virtualise déjà, et la surface réellement
 * utilisée par ruler-picker se limite à `AnimatedFlashList`, `scrollToOffset` et deux
 * types.
 *
 * Le jour où l'application passera à la nouvelle architecture, supprimer l'alias dans
 * metro.config.js et réinstaller FlashList suffit.
 */

export const FlashList = FlatList;
export type FlashList<ItemT> = FlatList<ItemT>;

export const AnimatedFlashList = Animated.createAnimatedComponent(FlatList);

export type ListRenderItem<ItemT> = NonNullable<FlatListProps<ItemT>['renderItem']>;
export type ListRenderItemInfo<ItemT> = Parameters<ListRenderItem<ItemT>>[0];

export default FlashList;
