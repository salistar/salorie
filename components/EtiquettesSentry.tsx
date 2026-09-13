/**
 * Tient les étiquettes Sentry à jour, depuis l'intérieur des contextes.
 * ---------------------------------------------------------------------------
 * Le thème et la langue vivent dans des contextes React : ils ne sont pas
 * connus au moment du `Sentry.init`, et ils CHANGENT en cours de session. Ce
 * composant ne rend rien — il est monté à l'intérieur des deux fournisseurs et
 * repose les étiquettes chaque fois que l'un des deux bouge.
 *
 * ⚠ POURQUOI UN COMPOSANT PLUTÔT QU'UN APPEL DANS `_layout`.
 * Les valeurs s'obtiennent par `useTheme()` et `useTranslation()`, qui exigent
 * d'être SOUS leurs fournisseurs respectifs. Un appel écrit à côté de
 * `<ThemeProvider>` jetterait « must be used inside ThemeProvider » — au
 * démarrage, sur l'écran blanc.
 */
import React, { useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { poserTags, tagsInterface } from '../lib/sentryTags';

export default function EtiquettesSentry(): null {
  const { theme, resolved } = useTheme();
  const { language } = useTranslation();

  useEffect(() => {
    poserTags(tagsInterface({ theme, apparence: resolved, langue: language }));
  }, [theme, resolved, language]);

  return null;
}
