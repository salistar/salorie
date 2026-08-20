'use client';
// Appel du duo — la destination des liens que le mobile partage déjà.
// ---------------------------------------------------------------------------
// `duo-walk.tsx` partage `https://salorie.com/duo/<id>` depuis des mois. Cette
// adresse ne menait NULLE PART : l'invité qui ouvrait le lien sur un ordinateur
// tombait sur un 404. Cette page est ce qui manquait au bout du lien.
//
// Répartition assumée des rôles : le TÉLÉPHONE marche (GPS, position, distance),
// le navigateur ACCOMPAGNE — on parle, on se voit, on suit. Le web ne prétend
// donc pas mesurer un parcours ; il reçoit les positions et affiche la distance
// de l'autre.
//
// Sécurité : c'est le SERVEUR qui borne le duo à deux personnes et exige
// qu'elles soient amies. Un identifiant deviné reçoit `duo:refus`, et cette
// page le dit clairement au lieu de tourner dans le vide.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from 'lucide-react';
import { useMe } from '../../MeProvider';
import { useProfil } from '../../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../../lib/i18nMe';
import {
  connecterSocial, deconnecterSocial, rejoindreDuo, quitterDuo,
  socketSocial, socialConfigure,
} from '../../../../lib/socketSocial';
import { ouvrirAppel, appelDisponible, type SessionAppel } from '../../../../lib/appelWeb';

/** Clé Maps. Absente, la carte ne s'affiche pas — plutôt qu'un cadre d'erreur
 *  Google en travers de l'écran pendant un appel. */
const CLE_CARTE = (process.env.NEXT_PUBLIC_GMAP_KEY || '').trim();

type Etat = 'attente' | 'connexion' | 'en_appel' | 'refuse' | 'impossible';

export default function PageDuo() {
  const params = useParams<{ id: string }>();
  const duoId = String(params?.id || '');
  const recherche = useSearchParams();
  // Celui qui CRÉE le duo émet l'offre ; l'invité attend. Si les deux
  // émettaient, chacun répondrait à l'offre de l'autre et la négociation
  // partirait en boucle. Le lien partagé fait donc de son destinataire l'invité.
  const initiateur = recherche?.get('hote') === '1';

  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [etat, setEtat] = useState<Etat>('attente');
  const [present, setPresent] = useState(false);
  const [microCoupe, setMicroCoupe] = useState(false);
  const [cameraCoupee, setCameraCoupee] = useState(false);
  const [avecVideo, setAvecVideo] = useState(false);
  const [sansRelais, setSansRelais] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  // Le telephone envoie lat/lng depuis toujours ; cet ecran n'en lisait que le
  // kilometrage et jetait le reste. Un nombre qui monte ne dit pas OU marche
  // l'autre — c'est pourtant la seule chose qu'on veut savoir en l'accompagnant.
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [erreur, setErreur] = useState('');

  const session = useRef<SessionAppel | null>(null);
  const videoLocale = useRef<HTMLVideoElement | null>(null);
  const videoDistante = useRef<HTMLVideoElement | null>(null);
  const audioDistant = useRef<HTMLAudioElement | null>(null);

  // ── Salon : on rejoint à l'arrivée, on quitte au départ ───────────────────
  useEffect(() => {
    if (!duoId || !uid) return;
    let vivant = true;
    (async () => {
      const s = await connecterSocial();
      if (!vivant) return;
      if (!s) { setEtat('impossible'); return; }
      s.on('duo:refus', (d: any) => {
        // Le serveur n'ouvre un duo qu'entre AMIS : le dire franchement.
        setEtat('refuse');
        setErreur(d?.motif === 'pas_ami' ? t('duoRefusAmi') : t('duoRefus'));
      });
      s.on('duo:arrivee', () => setPresent(true));
      s.on('duo:depart', () => setPresent(false));
      s.on('duo:pos', (d: any) => {
        const km = Number(d?.km);
        if (Number.isFinite(km)) setDistanceKm(km);
        const lat = Number(d?.lat);
        const lng = Number(d?.lng);
        // Le (0, 0) est au large du golfe de Guinee : c'est la valeur qu'envoie un
        // GPS qui n'a pas encore accroche, pas un lieu ou quelqu'un marche.
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
          setPosition({ lat, lng });
        }
      });
      rejoindreDuo(duoId);
    })();
    return () => {
      vivant = false;
      session.current?.raccrocher();
      session.current = null;
      quitterDuo(duoId);
      deconnecterSocial();
    };
  }, [duoId, uid, t]);

  // ── Attacher les flux aux éléments média ──────────────────────────────────
  const attacherDistant = useCallback((f: MediaStream) => {
    // L'audio a son propre élément : si la seule sortie était la balise vidéo,
    // un appel SANS image resterait muet — la vidéo n'a alors rien à afficher
    // et certains navigateurs ne la lisent pas.
    if (audioDistant.current) {
      audioDistant.current.srcObject = f;
      audioDistant.current.play().catch(() => { /* politique d'autoplay */ });
    }
    if (videoDistante.current) videoDistante.current.srcObject = f;
  }, []);

  const appeler = useCallback(async (video: boolean) => {
    if (!appelDisponible()) { setEtat('impossible'); return; }
    setEtat('connexion');
    setErreur('');
    try {
      const s = await ouvrirAppel(duoId, initiateur, { video });
      if (!s) { setEtat('impossible'); return; }
      session.current = s;
      setAvecVideo(video);
      setSansRelais(!s.relaisDisponible);
      s.surFluxDistant(attacherDistant);
      s.surEtat((e) => {
        if (e === 'connected') setEtat('en_appel');
        if (e === 'failed' || e === 'closed') { setEtat('attente'); session.current = null; }
      });
      if (video && s.fluxLocal && videoLocale.current) {
        videoLocale.current.srcObject = s.fluxLocal;
      }
      setEtat('en_appel');
    } catch {
      // Micro ou caméra refusés : la cause la plus fréquente, et la seule que
      // la personne peut corriger elle-même.
      setErreur(t('duoMicroRefuse'));
      setEtat('attente');
    }
  }, [duoId, initiateur, attacherDistant, t]);

  const raccrocher = useCallback(() => {
    session.current?.raccrocher();
    session.current = null;
    setEtat('attente');
    setAvecVideo(false);
    setMicroCoupe(false);
    setCameraCoupee(false);
  }, []);

  const enAppel = etat === 'en_appel' || etat === 'connexion';

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('duoTitre')}</h1>
        <p className="me-sous">{t('duoSous')}</p>
      </header>

      {!socialConfigure() || etat === 'impossible' ? (
        <section className="carte-amis"><p className="me-erreur">{t('duoImpossible')}</p></section>
      ) : null}
      {etat === 'refuse' ? (
        <section className="carte-amis"><p className="me-erreur">{erreur}</p></section>
      ) : null}

      <section className="carte-amis">
        <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
          <span className={`duo-pastille${present ? ' presente' : ''}`}>
            {present ? t('duoAutrePresent') : t('duoAutreAbsent')}
          </span>
          {distanceKm != null ? (
            <span className="me-note">{t('duoDistance')} {distanceKm.toFixed(2)} km</span>
          ) : null}
        </div>

        {sansRelais && enAppel ? <p className="me-note">{t('duoSansRelais')}</p> : null}
        {erreur && etat !== 'refuse' ? <p className="me-erreur">{erreur}</p> : null}

        <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {!enAppel ? (
            <>
              <button className="btn btn-primary btn-icone" onClick={() => appeler(false)} disabled={etat === 'refuse'}>
                <Phone size={15} /> {t('duoAppelVoix')}
              </button>
              <button className="btn btn-icone" onClick={() => appeler(true)} disabled={etat === 'refuse'}>
                <Video size={15} /> {t('duoAppelVideo')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-icone btn-danger" onClick={raccrocher}>
                <PhoneOff size={15} /> {t('duoRaccrocher')}
              </button>
              <button
                className="btn btn-icone"
                onClick={() => { const v = !microCoupe; setMicroCoupe(v); session.current?.couperMicro(v); }}
              >
                {microCoupe ? <MicOff size={15} /> : <Mic size={15} />}
                {microCoupe ? t('duoMicroCoupe') : t('duoMicroOuvert')}
              </button>
              {avecVideo ? (
                <>
                  <button
                    className="btn btn-icone"
                    onClick={() => { const v = !cameraCoupee; setCameraCoupee(v); session.current?.couperCamera(v); }}
                  >
                    {cameraCoupee ? <VideoOff size={15} /> : <Video size={15} />}
                    {cameraCoupee ? t('duoCameraCoupee') : t('duoCameraOuverte')}
                  </button>
                  <button className="btn btn-icone" onClick={() => session.current?.basculerCamera()}>
                    <SwitchCamera size={15} /> {t('duoBasculerCamera')}
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
        <p className="me-note">{t('duoNoteVoix')}</p>
      </section>

      {/* L'audio vit toujours, meme sans image : c'est lui qui porte l'appel. */}
      <audio ref={audioDistant} autoPlay playsInline />

      {/* La carte n'apparait QUE lorsqu'une position arrive. Un cadre vide « en
          attente du GPS » occuperait la moitie de l'ecran pour ne rien dire, et
          l'appel voix seul — le mode normal — n'a aucune position a montrer.
          Embed plutot que le SDK : une iframe ne charge aucune bibliotheque dans
          le paquet, et cet ecran n'a besoin de rien d'interactif. */}
      {position && CLE_CARTE ? (
        <section className="carte-amis">
          <h2 className="me-sous-titre">{t('duoOuEstIl')}</h2>
          <div className="duo-carte">
            <iframe
              title={t('duoOuEstIl')}
              className="duo-carte-cadre"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/view?key=${CLE_CARTE}&center=${position.lat},${position.lng}&zoom=15`}
            />
          </div>
          <p className="me-note">{t('duoCarteNote')}</p>
        </section>
      ) : null}

      {avecVideo ? (
        <section className="carte-amis">
          <div className="duo-videos">
            <div className="duo-cadre">
              <video ref={videoDistante} autoPlay playsInline className="duo-video" />
              <span className="duo-etiquette">{t('duoLautre')}</span>
            </div>
            <div className="duo-cadre petit">
              {/* `muted` sur SA PROPRE image : sans cela, le micro se reboucle
                  dans les haut-parleurs et l'appel devient inaudible. */}
              <video ref={videoLocale} autoPlay playsInline muted className="duo-video" />
              <span className="duo-etiquette">{t('duoMoi')}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="carte-amis">
        <p className="me-note">{t('duoNoteRoles')}</p>
      </section>
    </div>
  );
}
