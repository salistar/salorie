'use client';
import React, { useId } from 'react';

/**
 * Champ de formulaire libellé — primitif PARTAGÉ.
 *
 * Audit formulaires, deux défauts corrigés ici d'un coup :
 *  1. Il existait DEUX définitions locales identiques (races/RaceForm.tsx et orgs/page.tsx),
 *     chacune avec ses propres styles inline → toute correction devait être faite deux fois.
 *  2. Le <label> n'était qu'un frère JSX du champ : aucune association, donc un lecteur
 *     d'écran annonçait « zone de saisie » sans nom, et cliquer le libellé ne focalisait rien.
 *
 * On génère un id stable (useId, sûr en SSR) qu'on pose sur le label via htmlFor et qu'on
 * injecte dans l'enfant par cloneElement — sauf si l'appelant a déjà fourni son propre id.
 */
export default function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactElement;
}) {
  const auto = useId();
  const id = (children?.props as any)?.id || auto;
  const hintId = hint ? `${id}-hint` : undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id,
        ...(hintId ? { 'aria-describedby': hintId } : {}),
      } as any)
    : children;

  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {control}
      {hint ? <span id={hintId} className="hint">{hint}</span> : null}
    </div>
  );
}
