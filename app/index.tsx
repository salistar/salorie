import React from 'react';
import { View } from 'react-native';

/**
 * Pass-through root route. Does NOT render any branded loading UI — the
 * global auth guard in `_layout.tsx` decides the destination (welcome,
 * tabs, or onboarding) and redirects before anything meaningful can show.
 * Keeping this invisible avoids the "splash" flash the user complained
 * about on reconnect.
 */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
