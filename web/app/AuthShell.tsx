import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Cadre partagé des pages Connexion et Inscription : une photo pleine hauteur d'un
 * côté, le formulaire de l'autre.
 *
 * L'image porte le message, le texte le tient : d'où une accroche courte posée SUR la
 * photo, en surimpression sombre pour que le blanc reste lisible quelle que soit la
 * zone de l'image. Elle est décorative — `alt=""` — car tout ce qu'elle raconte est
 * déjà écrit à côté ; l'annoncer à un lecteur d'écran ne ferait que du bruit.
 *
 * Photos du domaine public (CC0, Wikimedia Commons), stockées dans public/auth :
 * aucune attribution requise et aucune dépendance à un service externe.
 */
export default function AuthShell({
  image,
  accroche,
  sousTitre,
  children,
}: {
  image: string;
  accroche: string;
  sousTitre: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <Image
          src={image}
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 100vw, 50vw"
          style={{ objectFit: 'cover' }}
        />
        <div className="auth-visual-veil" />
        <div className="auth-visual-text">
          <div className="auth-visual-brand">🔥 Salorie</div>
          <p className="auth-visual-h">{accroche}</p>
          <p className="auth-visual-p">{sousTitre}</p>
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-inner">{children}</div>
      </div>
    </div>
  );
}
