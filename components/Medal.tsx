import React from 'react';
import { SvgXml } from 'react-native-svg';
import { buildMedalSvg, MedalParams } from '../lib/medalFrames';

// Rend une médaille paramétrable (thème + tokens) via SVG.
export default function Medal({ width = 180, ...params }: MedalParams & { width?: number }) {
  const xml = buildMedalSvg(params);
  return <SvgXml xml={xml} width={width} height={(width * 384) / 264} />;
}
