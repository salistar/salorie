/**
 * « Entrée valide » sur les formulaires admin dépourvus de <form>.
 *
 * Renvoie les props à étaler sur un <input>. On ne déclenche QUE sur Entrée seule :
 * Shift+Entrée et la composition (IME — saisie arabe, chinoise…) doivent passer,
 * sinon on soumettrait au milieu d'un mot en cours de composition.
 */
export function onEnter(action: () => void) {
  return {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
      e.preventDefault();
      action();
    },
  };
}
