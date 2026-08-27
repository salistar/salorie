import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { Colors } from '../constants/Colors';
import { THEMES, CleTheme, ORDRE_THEMES } from '../constants/themesGeneres';
import { couleursDepuisTheme } from '../constants/derivationThemes';

// Le contexte porte SIX thèmes, pas deux.
// ---------------------------------------------------------------------------
// Il n'en connaissait que `light` / `dark` / `system`, alors que les six
// palettes partagées existaient déjà — générées, contrôlées en contraste, et
// appliquées sur les trois surfaces web. Le mobile en était la seule exclue.
//
// ⚠ RIEN N'EST RETIRÉ : 131 fichiers lisent `resolved` et `colors`, 3 écrivent
// `mode`. Ces trois champs gardent leur type et leur sens exacts. `theme` est
// ajouté à côté, et c'est lui que consomment les tokens.

/** L'ancien vocabulaire. Conservé : trois écrans l'emploient encore. */
export type ThemeMode = 'light' | 'dark' | 'system';
/** Le nouveau : les six palettes, ou « suivre le système ». */
export type ChoixTheme = CleTheme | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  /** Le thème réellement appliqué, parmi les six. */
  theme: CleTheme;
  /** Le choix brut, « system » compris — pour cocher la bonne pastille. */
  choix: ChoixTheme;
  resolved: ResolvedTheme;
  colors: typeof Colors.light;
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Choisir l'une des six palettes, ou revenir au système. */
  setTheme: (choix: ChoixTheme) => Promise<void>;
}

const THEME_KEY = 'app_theme_mode';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const estCleTheme = (v: unknown): v is CleTheme =>
  typeof v === 'string' && (ORDRE_THEMES as readonly string[]).includes(v);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [choix, setChoixState] = useState<ChoixTheme>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (!v) return;
        // ⚠ COMPATIBILITÉ — à ne pas retirer.
        // Les téléphones déjà installés ont « light » ou « dark » écrits dans
        // AsyncStorage. Sans cette traduction, leur réglage serait simplement
        // oublié au premier lancement de la mise à jour : pas d'erreur, pas de
        // message, juste un thème qui change tout seul.
        if (v === 'light') setChoixState('ivory');
        else if (v === 'dark') setChoixState('obsidian');
        else if (v === 'system' || estCleTheme(v)) setChoixState(v as ChoixTheme);
      })
      .catch(() => {});
  }, []);

  const setTheme = async (nouveau: ChoixTheme) => {
    setChoixState(nouveau);
    try {
      await AsyncStorage.setItem(THEME_KEY, nouveau);
    } catch {
      /* stockage indisponible : le choix vaudra pour cette session seulement */
    }
  };

  /** L'ancienne API, réexprimée dans la nouvelle. */
  const setMode = async (nouveauMode: ThemeMode) => {
    await setTheme(
      nouveauMode === 'light' ? 'ivory' : nouveauMode === 'dark' ? 'obsidian' : 'system'
    );
  };

  // « system » ne fige pas une palette : il suit le réglage de l'appareil, et
  // continue de le suivre si l'utilisateur le change pendant que l'app tourne.
  const theme: CleTheme =
    choix === 'system' ? (systemScheme === 'dark' ? 'obsidian' : 'ivory') : choix;

  const resolved: ResolvedTheme = THEMES[theme].sombre ? 'dark' : 'light';
  const mode: ThemeMode = choix === 'system' ? 'system' : resolved;

  const colors = React.useMemo(() => couleursDepuisTheme(theme), [theme]);

  useEffect(() => {
    // Le fond posé DERRIÈRE l'application : il apparaît pendant les
    // transitions et au-delà des bords en rebond. Un noir fixe faisait
    // clignoter du noir sur un thème rose.
    SystemUI.setBackgroundColorAsync(THEMES[theme].bg).catch(() => {});
  }, [theme]);

  const value = React.useMemo(
    () => ({ mode, theme, choix, resolved, colors, setMode, setTheme }),
    [mode, theme, choix, resolved, colors]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
