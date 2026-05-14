import { Stack } from "expo-router";
import { useTheme } from "../../lib/ThemeContext";

export default function AuthLayout() {
  const { resolved } = useTheme();
  const bgColor = resolved === 'dark' ? '#000000' : 'transparent';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bgColor },
      }}
    />
  );
}
