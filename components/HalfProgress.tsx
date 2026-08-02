import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';

/**
 * HalfProgress — a semicircular arc gauge rendered with SVG so the green
 * fill ALWAYS starts at 9 o'clock (the beginning of the gauge) and sweeps
 * clockwise toward 3 o'clock as progress grows. Implemented via
 * strokeDasharray on an <svg> arc path — no more rotating-View trickery,
 * no more "green appears at the top first" artifacts.
 */

interface HalfProgressProps {
  /** 0 to 1 */
  progress: number;
  /** Overall diameter of the full circle; visible height = size / 2 + stroke */
  size?: number;
  /** Arc stroke width */
  strokeWidth?: number;
  /** Filled arc colour */
  color?: string;
  /** Background (unfilled) track colour */
  trackColor?: string;
  /** Optional content rendered below the arc centre (e.g. labels) */
  children?: React.ReactNode;
}

export default function HalfProgress({
  progress,
  size = 220,
  strokeWidth = 20,
  color,
  trackColor,
  children,
}: HalfProgressProps) {
  // Défauts calculés ICI et non dans la signature : les valeurs par défaut d'un paramètre
  // sont évaluées hors de tout contexte de thème. `trackColor` valait gray[100] (#F1F5F9),
  // soit un arc quasi blanc sur une carte sombre — l'unique appelant ne le surchargeant pas.
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const arcColor = color ?? (isDark ? Colors.dark.primary : Colors.light.primary);
  const arcTrack = trackColor ?? (isDark ? Colors.dark.gray[100] : Colors.light.gray[100]);
  const p = Math.min(1, Math.max(0, progress));

  // Centre-line radius of the stroke (so the stroke stays inside the size box)
  const r = size / 2 - strokeWidth / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Semi-circle path: start at 9 o'clock, arc CW through 12 o'clock, end at 3 o'clock.
  // sweep-flag = 1 in SVG screen coords = clockwise.
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  // Perimeter of the semicircle (length of the stroke we can paint).
  const circumference = Math.PI * r;
  // Only the first p × circumference units of the stroke are drawn.
  // dasharray = [onLength, offLength]. onLength = p*C means: draw the first
  // p*C units starting from the path's beginning (9 o'clock), then leave
  // everything after that as a gap.
  const dashArray = `${p * circumference} ${circumference}`;

  // SVG viewport: top half of the circle + half the stroke so rounded caps fit.
  const svgHeight = size / 2 + strokeWidth / 2;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={svgHeight}>
        {/* Track (always visible, full half-circle, gray) */}
        <Path
          d={arcPath}
          stroke={arcTrack}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Progress fill (green, starts at 9 o'clock, grows CW) */}
        {p > 0 && (
          <Path
            d={arcPath}
            stroke={arcColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dashArray}
          />
        )}
      </Svg>

      {/* Optional content below the arc (labels, numbers etc.) */}
      {children}
    </View>
  );
}
