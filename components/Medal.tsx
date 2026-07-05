import React from 'react';
import { View, Image } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { buildMedalSvg, MedalParams } from '../lib/medalFrames';

// Rend une médaille : le SVG = le cadre (vecteur, sans image distante → pas de crash) ;
// la photo du lieu est un overlay RN <Image> circulaire au centre du médaillon.
export default function Medal({ width = 180, photoSource, ...params }: MedalParams & { width?: number; photoSource?: any }) {
  const xml = buildMedalSvg(params);
  const h = (width * 384) / 264;
  // Centre du médaillon dans le viewBox 264x384 : (132, 192), rayon photo ~50.
  const size = (100 / 264) * width;
  const left = (132 / 264) * width - size / 2;
  const top = (192 / 384) * h - size / 2;
  // photoSource = asset local require() (poiPhoto) OU {uri}; sinon photoUrl distant.
  const src = photoSource || (params.photoUrl ? { uri: params.photoUrl } : null);
  return (
    <View style={{ width, height: h }}>
      <SvgXml xml={xml} width={width} height={h} />
      {src ? (
        <Image
          source={src}
          style={{ position: 'absolute', left, top, width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}
