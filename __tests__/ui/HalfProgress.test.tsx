import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

// Mock react-native-svg so we can introspect the rendered <Path> elements
// (their props) without a native SVG renderer. Vars used inside jest.mock
// factories MUST be prefixed with `mock` (jest hoisting rule).
jest.mock('react-native-svg', () => {
  const React = require('react');
  const mockSvg = ({ children, ...props }: any) =>
    React.createElement('Svg', props, children);
  const mockPath = (props: any) => React.createElement('Path', props);
  return { __esModule: true, default: mockSvg, Path: mockPath, Svg: mockSvg };
});

import HalfProgress from '../../components/HalfProgress';

describe('<HalfProgress />', () => {
  it('rend la piste (track) + le remplissage quand progress > 0', () => {
    const { UNSAFE_getAllByType } = render(<HalfProgress progress={0.5} />);
    const Path = require('react-native-svg').Path;
    const paths = UNSAFE_getAllByType(Path);
    // 1 track + 1 fill
    expect(paths.length).toBe(2);
  });

  it("ne rend QUE la piste quand progress = 0 (pas de remplissage)", () => {
    const { UNSAFE_getAllByType } = render(<HalfProgress progress={0} />);
    const Path = require('react-native-svg').Path;
    const paths = UNSAFE_getAllByType(Path);
    expect(paths.length).toBe(1);
  });

  it('clampe progress > 1 et calcule un dashArray plein', () => {
    const size = 220;
    const strokeWidth = 20;
    const { UNSAFE_getAllByType } = render(
      <HalfProgress progress={5} size={size} strokeWidth={strokeWidth} />
    );
    const Path = require('react-native-svg').Path;
    const paths = UNSAFE_getAllByType(Path);
    expect(paths.length).toBe(2);

    const r = size / 2 - strokeWidth / 2;
    const circumference = Math.PI * r;
    // p est clampé à 1 => onLength === circumference
    const fill = paths[1];
    expect(fill.props.strokeDasharray).toBe(`${circumference} ${circumference}`);
  });

  it('applique les couleurs et la largeur de trait fournies', () => {
    const { UNSAFE_getAllByType } = render(
      <HalfProgress
        progress={0.5}
        color="#abc123"
        trackColor="#eeeeee"
        strokeWidth={12}
      />
    );
    const Path = require('react-native-svg').Path;
    const paths = UNSAFE_getAllByType(Path);
    const [track, fill] = paths;
    expect(track.props.stroke).toBe('#eeeeee');
    expect(track.props.strokeWidth).toBe(12);
    expect(fill.props.stroke).toBe('#abc123');
    expect(fill.props.strokeWidth).toBe(12);
  });

  it('utilise size pour la largeur du Svg et calcule la hauteur du demi-cercle', () => {
    const size = 200;
    const strokeWidth = 20;
    const { UNSAFE_getByType } = render(
      <HalfProgress progress={0.3} size={size} strokeWidth={strokeWidth} />
    );
    const Svg = require('react-native-svg').default;
    const svg = UNSAFE_getByType(Svg);
    expect(svg.props.width).toBe(size);
    expect(svg.props.height).toBe(size / 2 + strokeWidth / 2);
  });

  it('rend les enfants (children) sous l’arc', () => {
    const { getByText } = render(
      <HalfProgress progress={0.5}>
        <Text>1200 / 2000</Text>
      </HalfProgress>
    );
    expect(getByText('1200 / 2000')).toBeTruthy();
  });
});
