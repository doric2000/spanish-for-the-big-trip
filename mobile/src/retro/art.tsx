import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { retro } from '../theme';

const grain = require('../../assets/brand/grain.png');

// Logo D1 drawn from the exact Figma paths (61:291): ס, the tilde flight path and the sun.
const SAMEKH = 'M91.0708 148.512C84.52 148.512 78.7251 147.042 73.686 144.103C68.647 141.163 64.6997 137.048 61.8442 131.757C59.0308 126.466 57.561 120.293 57.4351 113.238V108.325C57.3931 105.764 57.729 103.118 58.4429 100.389C59.1567 97.6592 60.1016 95.1396 61.2773 92.8301C62.4531 90.4785 63.7129 88.6099 65.0566 87.2241C65.2246 87.0562 65.3716 86.9092 65.4976 86.7832C65.6655 86.6152 65.8335 86.4683 66.0015 86.3423L65.9385 86.0273C64.6787 86.2373 63.041 86.5942 61.0254 87.0981C59.0098 87.6021 57.2881 88.043 55.8604 88.4209L52.27 74.6265C55.6714 73.6606 59.4297 72.7998 63.5449 72.0439C67.7021 71.2881 71.9224 70.7212 76.2056 70.3433C80.5308 69.9233 84.625 69.7134 88.4883 69.7134C96.2148 69.7134 102.766 71.0991 108.141 73.8706C113.558 76.6001 117.673 80.6313 120.486 85.9644C123.3 91.2974 124.707 97.8691 124.707 105.68V113.238C124.707 120.293 123.3 126.466 120.486 131.757C117.715 137.048 113.81 141.163 108.771 144.103C103.731 147.042 97.8315 148.512 91.0708 148.512ZM91.0708 132.828C94.0103 132.828 96.5718 132.009 98.7554 130.371C100.981 128.733 102.703 126.466 103.92 123.568C105.138 120.629 105.747 117.207 105.747 113.301V105.995C105.747 101.501 105.159 97.7222 103.983 94.6567C102.85 91.5913 101.17 89.2607 98.9443 87.665C96.7607 86.0693 94.0732 85.2715 90.8818 85.2715C87.8584 85.2715 85.2549 86.1113 83.0713 87.791C80.9297 89.4707 79.292 91.9272 78.1582 95.1606C77.0244 98.394 76.4365 102.341 76.3945 107.002V113.301C76.3945 117.207 77.0034 120.629 78.2212 123.568C79.439 126.466 81.1396 128.733 83.3232 130.371C85.5488 132.009 88.1313 132.828 91.0708 132.828Z';
const TILDE = 'M46.5 46.5C60 28.5 76.5 28.5 90 40.5C103.5 52.5 118.5 52.5 132 34.5';

export function D1Mark({ size, tile, ink, tilde, sun }: { size: number; tile: string; ink: string; tilde: string; sun: string }) {
  return <Svg width={size} height={size} viewBox="0 0 180 180" accessible={false}>
    <Rect width={180} height={180} rx={40} fill={tile} />
    <Path d={SAMEKH} fill={ink} />
    <Path d={TILDE} stroke={tilde} strokeWidth={13.5} strokeLinecap="round" fill="none" />
    <Circle cx={147} cy={22.5} r={8.25} fill={sun} />
  </Svg>;
}

// Screen-print grain: a small noise tile repeated over the area. Purely decorative.
export function Grain({ opacity = 0.12 }: { opacity?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
    <Image source={grain} resizeMode="repeat" style={StyleSheet.absoluteFill} accessible={false} />
  </View>;
}

// The plane used across the trip screens. It points left: in Hebrew the trip goes
// from right (Hebrew) to left (Spanish).
export function Plane({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d="M22 12.6 2 12l5 4.5-1.5 4h2l3-3.7L19 17l1-1-4-2.8L22 12.6Z" fill={color} />
    <Path d="M10.5 12 15 4h-2.2l-6 8z" fill={color} />
  </Svg>;
}

export const palette = retro.colors;
