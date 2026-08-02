import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

interface LoggingContextType {
  isLogModalVisible: boolean;
  initialLogType: 'meal' | 'activity' | 'water';
  showLogModal: (type?: 'meal' | 'activity' | 'water') => void;
  hideLogModal: () => void;
  isActionMenuVisible: boolean;
  showActionMenu: () => void;
  hideActionMenu: () => void;
  triggerRefresh: () => void;
  refreshCount: number;
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  scanImageBase64: string | null;
  setScanImageBase64: (b64: string | null) => void;
}

const LoggingContext = createContext<LoggingContextType | undefined>(undefined);

export function LoggingProvider({ children }: { children: ReactNode }) {
  const [isLogModalVisible, setIsLogModalVisible] = useState(false);
  const [isActionMenuVisible, setIsActionMenuVisible] = useState(false);
  const [initialLogType, setInitialLogType] = useState<'meal' | 'activity' | 'water'>('meal');
  const [refreshCount, setRefreshCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => {
    // LOCAL date string — toISOString uses UTC and in UTC+X timezones near
    // midnight it rolls the date back one day, which used to make the
    // calendar select Sunday when tapping today.
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [scanImageBase64, setScanImageBase64] = useState<string | null>(null);

  const showLogModal = useCallback((type: 'meal' | 'activity' | 'water' = 'meal') => {
    setInitialLogType(type);
    setIsLogModalVisible(true);
    setIsActionMenuVisible(false); // Hide menu when modal opens
  }, []);
  const hideLogModal = useCallback(() => setIsLogModalVisible(false), []);

  const showActionMenu = useCallback(() => setIsActionMenuVisible(true), []);
  const hideActionMenu = useCallback(() => setIsActionMenuVisible(false), []);

  const triggerRefresh = useCallback(() => setRefreshCount(prev => prev + 1), []);

  // FIX cascade re-renders : value inline recréée à chaque render → tous les consommateurs
  // (ActionMenu/LogModal montés GLOBALEMENT + de nombreux écrans) re-rendaient en cascade.
  // Mémoïsée : ne change que quand un état du contexte change réellement.
  const value = useMemo(
    () => ({
      isLogModalVisible,
      initialLogType,
      showLogModal,
      hideLogModal,
      isActionMenuVisible,
      showActionMenu,
      hideActionMenu,
      triggerRefresh,
      refreshCount,
      selectedDate,
      setSelectedDate,
      scanImageBase64,
      setScanImageBase64,
    }),
    [isLogModalVisible, initialLogType, showLogModal, hideLogModal, isActionMenuVisible,
     showActionMenu, hideActionMenu, triggerRefresh, refreshCount, selectedDate, scanImageBase64]
  );

  return (
    <LoggingContext.Provider value={value}>
      {children}
    </LoggingContext.Provider>
  );
}

export function useLogging() {
  const context = useContext(LoggingContext);
  if (context === undefined) {
    throw new Error('useLogging must be used within a LoggingProvider');
  }
  return context;
}
