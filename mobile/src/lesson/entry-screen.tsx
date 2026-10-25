import { useEffect, useState } from 'react';
import { type ImageSourcePropType, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { retro } from '../theme';
import { LessonButton, LessonSaveError, type SaveState } from './lesson-button';
import { LessonHeader } from './lesson-header';

// Unit entry (Figma "Template / Entry" 80:269, approved by Dor 2026-10-16).
// All learner text comes from the unit; the scene is the unit's approved image.
const c = retro.colors;
const f = retro.fonts;

// Design space: a 350pt content column holds a 342x300 poster tilted -1.6deg inside
// a 350x309 box, with the unit stamp over its bottom-left corner.
const COLUMN = 350, BOX_H = 309.4, POSTER_W = 342, POSTER_H = 300;
const FRAME = 7, STAMP = 82, STAMP_END = 17.6, STAMP_BOTTOM = -5.6;

export type EntryContent = {
  titleHe: string; bodyHe: string; actionLabelHe: string;
  kickerHe: string | null; sceneCaption: string | null; characterNameHe: string | null;
};

type Props = {
  content: EntryContent; scene: ImageSourcePropType | null;
  unitCode: { short: string; long: string }; headerCode: string; index: number; count: number;
  save: SaveState; onStart: () => void; onClose: () => void;
};

export function EntryScreen({ content, scene, unitCode, headerCode, index, count, save, onStart, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  // Centre with padding: in the right-to-left ScrollView iOS ignored alignSelf on the
  // content container and pushed a fixed-width column against the right edge.
  const gutter = (windowWidth - column) / 2;
  const k = column / COLUMN;

  // Motion from the template: the poster drops in with a tilt (0.9s) and then sways,
  // a light sheen crosses it, and the stamp slams on after 1s. Reduced motion: static.
  const reduceMotion = useReducedMotion();
  const drop = useSharedValue(reduceMotion ? 1 : 0);
  const sway = useSharedValue(0);
  const sheen = useSharedValue(reduceMotion ? 1 : 0);
  const stamp = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    drop.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    sway.value = withDelay(900, withRepeat(withSequence(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      withTiming(-1, { duration: 2400, easing: Easing.inOut(Easing.sin) })), -1, true));
    sheen.value = withDelay(700, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }));
    stamp.value = withDelay(1000, withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) }));
  }, [reduceMotion, drop, sway, sheen, stamp]);
  const posterStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -60 }, { rotate: `${-1.6 - (1 - drop.value) * 6 + sway.value * 0.5}deg` }],
  }));
  const posterWidth = POSTER_W * k, posterHeight = POSTER_H * k;
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (sheen.value * 2 - 1) * posterWidth * 1.4 }, { rotate: '18deg' }] }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value, transform: [{ scale: 1.7 - stamp.value * 0.7 }, { rotate: '-12deg' }],
  }));

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={headerCode} index={index} count={count} onClose={onClose} topInset={insets.top} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      {content.kickerHe ? <Text style={styles.kicker}>{content.kickerHe}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>
      <View style={{ width: column, height: BOX_H * k, marginTop: 26, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles.posterShadow, { width: posterWidth, height: posterHeight }, posterStyle]}>
          <View style={styles.posterFrame}>
            <Scene source={scene} width={posterWidth - 2 * FRAME} height={posterHeight - 2 * FRAME} />
            {/* The fade and the sheen are drawn left to right whatever the app direction. */}
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" accessible={false} pointerEvents="none">
              <Defs><LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.night} stopOpacity={0.5} />
                <Stop offset="0.28" stopColor={c.night} stopOpacity={0} />
                <Stop offset="0.64" stopColor={c.deep} stopOpacity={0} />
                <Stop offset="1" stopColor={c.deep} stopOpacity={1} />
              </LinearGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#fade)" />
            </Svg>
            <Animated.View pointerEvents="none" style={[styles.sheen, { width: posterWidth * 0.35 }, sheenStyle]}>
              <Svg width="100%" height="100%" accessible={false}>
                <Defs><LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={c.cream} stopOpacity={0} />
                  <Stop offset="0.5" stopColor={c.cream} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={c.cream} stopOpacity={0} />
                </LinearGradient></Defs>
                <Rect width="100%" height="100%" fill="url(#sheen)" />
              </Svg>
            </Animated.View>
            {content.sceneCaption ? <Text style={styles.caption}>{content.sceneCaption}</Text> : null}
            {content.characterNameHe ? <Text style={styles.character}>{content.characterNameHe}</Text> : null}
          </View>
        </Animated.View>
        <Animated.View style={[styles.stamp, { end: STAMP_END * k, bottom: STAMP_BOTTOM * k }, stampStyle]}
          accessible accessibilityLabel={`יחידה ${unitCode.short}`}>
          <Svg style={styles.ring} width={68} height={68} accessible={false}>
            <Circle cx={34} cy={34} r={33} stroke={c.night} strokeWidth={2} strokeDasharray="5 4" fill="none" />
          </Svg>
          <Text style={styles.stampCode}>{unitCode.long}</Text>
          <Text style={styles.stampUnit}>{unitCode.short}</Text>
        </Animated.View>
      </View>
      <Text style={styles.body}>{content.bodyHe}</Text>
    </ScrollView>
    <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LessonSaveError message={save.errorHe} />
      <LessonButton label={content.actionLabelHe} busy={save.busy} onPress={onStart} />
    </View>
  </View>;
}

function Scene({ source, width, height }: { source: ImageSourcePropType | null; width: number; height: number }) {
  const [failed, setFailed] = useState(false);
  if (!source || failed) return <View style={styles.missing}>
    <Text accessibilityRole="alert" style={styles.missingText}>התמונה אינה זמינה כרגע.</Text>
  </View>;
  // An explicit size: sized only by its edges, iOS drew the image at its pixel size
  // and the poster showed a corner of it (mobile/AGENTS.md). Decorative: the body
  // text tells the scene, and the unit has no image description.
  return <Image source={source} style={{ width, height }} contentFit="cover" accessible={false}
    onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 2 },
  kicker: { fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.gold, writingDirection: 'rtl' },
  title: { fontFamily: f.poster, fontSize: 72, lineHeight: 62, paddingTop: 6, color: c.cream, writingDirection: 'rtl' },
  posterShadow: {
    borderRadius: 16, backgroundColor: c.cream,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 26 },
  },
  posterFrame: { flex: 1, borderRadius: 16, borderWidth: FRAME, borderColor: c.cream, overflow: 'hidden', backgroundColor: c.deep },
  sheen: { position: 'absolute', top: -40, bottom: -40, start: '32%' },
  caption: { position: 'absolute', top: 7, end: 7, fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.gold, writingDirection: 'ltr' },
  character: { position: 'absolute', bottom: 9, start: 9, fontFamily: f.poster, fontSize: 34, lineHeight: 34, color: c.cream, writingDirection: 'rtl' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  missingText: { fontFamily: f.body, fontSize: 16, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  stamp: {
    position: 'absolute', width: STAMP, height: STAMP, borderRadius: STAMP / 2, backgroundColor: c.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 10 },
  },
  ring: { position: 'absolute', top: 7, start: 7 },
  stampCode: { fontFamily: f.mono, fontSize: 9, lineHeight: 14, letterSpacing: 1.5, color: c.night, textAlign: 'center', writingDirection: 'ltr' },
  stampUnit: { fontFamily: f.poster, fontSize: 40, lineHeight: 36, color: c.night, textAlign: 'center', writingDirection: 'ltr' },
  body: { marginTop: 24, fontFamily: f.body, fontSize: 18, lineHeight: 29, color: c.cream, writingDirection: 'rtl' },
  footer: { paddingTop: 12 },
});
