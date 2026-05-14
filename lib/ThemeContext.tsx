import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { Colors } from '../constants/Colors';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: typeof Colors.light;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const THEME_KEY = 'app_theme_mode';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (v === 'dark' || v === 'light' || v === 'system') setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    console.log('[Theme] setMode called with:', newMode);
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_KEY, newMode);
    } catch {}
  };

  const resolved: ResolvedTheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const colors = resolved === 'dark' ? Colors.dark : Colors.light;

  // Update system-level background color when theme changes
  useEffect(() => {
    console.log('[Theme] resolved changed to:', resolved, 'mode:', mode);
    const rootColor = resolved === 'dark' ? '#000000' : Colors.light.white;
    SystemUI.setBackgroundColorAsync(rootColor).catch(() => {});
  }, [resolved, mode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
