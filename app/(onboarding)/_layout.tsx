import { Stack } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';

export default function OnboardingLayout() {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isDark ? '#000' : '#F8FAFC' },
      }}
    />
  );
}
