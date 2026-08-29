import { Stack } from "expo-router";
import { useTheme } from "../../lib/ThemeContext";
import { useTokens } from "../../constants/tokens";

export default function AuthLayout() {
  const { resolved } = useTheme();
  const k = useTokens();
  const bgColor = resolved === 'dark' ? k.bg : 'transparent';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bgColor },
      }}
    />
  );
}
