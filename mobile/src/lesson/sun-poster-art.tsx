import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { retro } from '../theme';

// Vocabulary card poster art (Figma 82:359 "Sun art"), drawn from the exact Figma
// shapes in its 338x262 design space: rays, a striped setting sun, two mountains,
// the sea and a wave. Purely decorative.
const c = retro.colors;
const W = 338, H = 262, SUN_X = 169, SUN_Y = 262;
const RAYS = [-75, -50, -25, 0, 25, 50, 75];

export function SunPosterArt({ width }: { width: number }) {
  const height = (width * H) / W;
  // The rays sway slowly around the sun. Reduced motion: still.
  const reduceMotion = useReducedMotion();
  const sway = useSharedValue(0);
  useEffect(() => {
    if (!reduceMotion) sway.value = withRepeat(withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduceMotion, sway]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * 12}deg` }] }));
  // Rotating a square centred on the sun keeps the pivot at the sun's centre.
  const side = height * 2;
  return <View pointerEvents="none" style={[styles.art, { width, height }]}>
    <Animated.View style={[{ position: 'absolute', width: side, height: side, left: width / 2 - height, top: 0 }, raysStyle]}>
      <Svg width={side} height={side} viewBox={`${SUN_X - H} 0 ${2 * H} ${2 * H}`} accessible={false}>
        {RAYS.map(angle => <G key={angle} transform={`rotate(${angle} ${SUN_X} ${SUN_Y})`}>
          <Path d={`M${SUN_X} ${SUN_Y}L${SUN_X - 5} -20H${SUN_X + 5}Z`} fill={c.cream} opacity={0.14} />
        </G>)}
      </Svg>
    </Animated.View>
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} viewBox={`0 0 ${W} ${H}`} accessible={false}>
      <Path transform="translate(73 166)" d="M0 96C0 70.5392 10.1143 46.1212 28.1178 28.1178C46.1212 10.1143 70.5392 0 96 0C121.461 0 145.879 10.1143 163.882 28.1178C181.886 46.1212 192 70.5392 192 96H0Z" fill={c.sunset} />
      <Rect x={73} y={196} width={192} height={5} fill={c.deep} />
      <Rect x={73} y={210} width={192} height={7} fill={c.deep} />
      <Rect x={73} y={226} width={192} height={10} fill={c.deep} />
      <Path transform="translate(0 196)" d="M0 66V40L34 14L56 30L90 0L120 26L146 12L176 34V66H0Z" fill={c.plum} />
      <Path transform="translate(228 210)" d="M110 52V20L80 0L54 18L24 4L0 26V52H110Z" fill={c.plum} />
      <Path transform="translate(0 239.72)" d="M0 6.27688C50 -1.72312 100 10.2769 170 4.27688C240 -1.72312 290 -1.72312 338 6.27688V22.2769H0V6.27688Z" fill={c.sea} />
      <Path transform="translate(0 250.5)" d="M0.384615 3.5C8.38462 0.166667 16.3846 0.166667 24.3846 3.5C32.3846 6.83333 40.3846 6.83333 48.3846 3.5C56.3846 0.166667 64.3846 0.166667 72.3846 3.5C80.3846 6.83333 88.3846 6.83333 96.3846 3.5C104.385 0.166667 112.385 0.166667 120.385 3.5C128.385 6.83333 136.385 6.83333 144.385 3.5C152.385 0.166667 160.385 0.166667 168.385 3.5C176.385 6.83333 184.385 6.83333 192.385 3.5C200.385 0.166667 208.385 0.166667 216.385 3.5C224.385 6.83333 232.385 6.83333 240.385 3.5C248.385 0.166667 256.385 0.166667 264.385 3.5C272.385 6.83333 280.385 6.83333 288.385 3.5C296.385 0.166667 304.385 0.166667 312.385 3.5C320.385 6.83333 328.385 6.83333 336.385 3.5" stroke={c.cream} strokeWidth={2} fill="none" />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  // Left-to-right coordinates for the art whatever the app direction.
  art: { position: 'absolute', bottom: 0, start: 0, direction: 'ltr', overflow: 'hidden' },
});
