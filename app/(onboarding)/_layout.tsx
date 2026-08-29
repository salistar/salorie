import { Stack } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';
import { useTokens } from '../../constants/tokens';

export default function OnboardingLayout() {
  const k = useTokens();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: k.surface },
      }}
    />
  );
}
