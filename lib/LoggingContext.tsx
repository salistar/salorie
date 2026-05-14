import React, { createContext, useContext, useState, ReactNode } from 'react';

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

  const showLogModal = (type: 'meal' | 'activity' | 'water' = 'meal') => {
    setInitialLogType(type);
    setIsLogModalVisible(true);
    setIsActionMenuVisible(false); // Hide menu when modal opens
  };
  const hideLogModal = () => setIsLogModalVisible(false);
  
  const showActionMenu = () => setIsActionMenuVisible(true);
  const hideActionMenu = () => setIsActionMenuVisible(false);

  const triggerRefresh = () => setRefreshCount(prev => prev + 1);

  return (
    <LoggingContext.Provider value={{ 
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
      setScanImageBase64
    }}>
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
