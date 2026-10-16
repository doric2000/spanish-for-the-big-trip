import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedProps, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import plan from '../../../docs/curriculum/curriculum-plan.json';
import { Grain } from '../retro/art';
import { retro } from '../theme';
import { chapterIcons } from './chapter-icons';
import {
  journeyFromPlan, layoutJourney, MAP_WIDTH, type PlacedPoster, type PlacedStamp, type PlanChapter, POSTER, routePath, STAMP,
} from './journey';

// Trip map, "posters along the road" (Claude Design prototype, artboard MapA, approved by
// Dor 2026-10-16). Each chapter is a travel poster; a chapter shows its own scene with its
// own character once that exists (only chapter 1, Juan at the hostel, so far).
const c = retro.colors;
const f = retro.fonts;
const OPEN_CHAPTERS = ['C01'];
const scenes: Record<string, { source: ImageSourcePropType; name: string; label: string }> = {
  C01: { source: require('../../../assets/characters/juan/scenes/unit1a-entry-hostel-v1.png'), name: 'חואן', label: 'חואן מנופף לשלום בהוסטל' },
};
// Poster colour sets, cycled by chapter.
const PALETTES = [
  { sky: c.deep, sun: c.sunset, ridge: c.plum, sea: c.sea, ink: c.cream },
  { sky: c.pink, sun: c.gold, ridge: c.night, sea: c.sunset, ink: c.night },
  { sky: c.gold, sun: c.cream, ridge: '#E0563A', sea: c.deep, ink: c.night },
  { sky: c.plum, sun: c.pink, ridge: c.sea, sea: c.gold, ink: c.plum },
  { sky: c.sea, sun: c.gold, ridge: c.sunset, sea: c.night, ink: c.night },
];
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Selection = { kind: 'poster'; poster: PlacedPoster } | { kind: 'stamp'; stamp: PlacedStamp } | null;

export default function JourneyScreen({ onOpenAccount, onStartUnit }: { onOpenAccount: () => void; onStartUnit?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chapters = useMemo(() => journeyFromPlan(plan.chapters as PlanChapter[], OPEN_CHAPTERS), []);
  // Positions come from the real screen width (see journey.ts for why there is no scaling).
  const layout = useMemo(() => layoutJourney(chapters, 150, width), [chapters, width]);
  const [selection, setSelection] = useState<Selection>(null);
  const reduceMotion = useReducedMotion();

  const flow = useSharedValue(0);
  useEffect(() => {
    if (!reduceMotion) flow.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1);
  }, [flow, reduceMotion]);
  const flowProps = useAnimatedProps(() => ({ strokeDashoffset: -flow.value * 36 }));
  const openPath = routePath(layout.route.slice(0, layout.openPoints));
  const lockedPath = routePath(layout.route.slice(layout.openPoints - 1));
  const contours = Array.from({ length: Math.ceil(layout.height / 90) }, (_, k) => {
    const b = 60 + k * 90;
    const w = width / MAP_WIDTH;
    return `M-20 ${b}C${80 * w} ${b - 30} ${140 * w} ${b + 30} ${220 * w} ${b}S${340 * w} ${b - 26} ${width + 20} ${b + 6}`;
  });
  const first = chapters[0];

  return <View style={styles.root}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={{ height: layout.height + insets.bottom }} showsVerticalScrollIndicator={false}>
      {/* Absolute positions are left-to-right screen coordinates, so this layer is LTR. */}
      <View style={{ width, height: layout.height, direction: 'ltr' }}>
        <Svg width={width} height={layout.height} style={StyleSheet.absoluteFill}>
          {contours.map(d => <Path key={d} d={d} stroke={c.cream} strokeOpacity={0.06} strokeWidth={1.2} fill="none" />)}
          <Path d={lockedPath} stroke={c.cream} strokeOpacity={0.28} strokeWidth={2.5} strokeDasharray="1 9" strokeLinecap="round" fill="none" />
          <AnimatedPath d={openPath} animatedProps={flowProps} stroke={c.gold} strokeWidth={3.5} strokeDasharray="12 6" strokeLinecap="round" fill="none" />
        </Svg>
        {layout.posters.map((poster, i) => <PosterCard key={poster.chapter.id} poster={poster} width={width} palette={PALETTES[i % PALETTES.length]}
          onPress={() => setSelection({ kind: 'poster', poster })} />)}
        {layout.stamps.map(stamp => <Stamp key={stamp.index} stamp={stamp} width={width} reduceMotion={reduceMotion}
          onPress={() => setSelection({ kind: 'stamp', stamp })} />)}
        <View style={[styles.finish, { top: layout.finishY - 10 }]}>
          <Text style={styles.finishTitle}>¡Buen viaje!</Text>
          <Text style={styles.finishText}>סוף הטיול הגדול</Text>
        </View>
      </View>
    </ScrollView>
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs><LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.night} /><Stop offset="0.7" stopColor={c.night} /><Stop offset="1" stopColor={c.night} stopOpacity={0} />
        </LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#fade)" />
      </Svg>
      <View>
        <Text style={styles.kicker}>VIAJE · Nº 001</Text>
        <Text accessibilityRole="header" style={styles.title}>הטיול שלי</Text>
      </View>
      <View style={styles.headerEnd}>
        <Text style={styles.pill}>{`פרק 1 · ${first.unitTitles.length} יחידות`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="החשבון שלי" onPress={onOpenAccount} hitSlop={8}
          style={({ pressed }) => [styles.accountButton, pressed && { opacity: 0.7 }]}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.cream} strokeWidth={1.8} strokeLinecap="round">
            <Circle cx={12} cy={8.5} r={4} /><Path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
          </Svg>
        </Pressable>
      </View>
    </View>
    <Grain opacity={0.12} />
    {selection && <Sheet selection={selection} bottomInset={insets.bottom} onClose={() => setSelection(null)} onStartUnit={onStartUnit} />}
  </View>;
}

function PosterCard({ poster, width, palette, onPress }: { poster: PlacedPoster; width: number; palette: typeof PALETTES[number]; onPress: () => void }) {
  const { chapter, x, y, onRight } = poster;
  const scene = scenes[chapter.id];
  const label = `פרק ${chapter.number}: ${chapter.title}${chapter.open ? '' : ', נעול'}`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.poster, { left: x, top: y, backgroundColor: palette.sky, transform: [{ rotate: onRight ? '2deg' : '-2deg' }, { scale: pressed ? 0.97 : 1 }] }]}>
      {scene ? <>
        {/* Explicit size: an iOS image sized only by absolute edges can draw at its pixel size
            and show a zoomed-in corner (same bug as the 1A scene, fixed the same way). */}
        <Image source={scene.source} resizeMode="cover" style={styles.sceneImage} accessibilityLabel={scene.label} />
        <Svg style={StyleSheet.absoluteFill}>
          <Defs><LinearGradient id={`p${chapter.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.night} stopOpacity={0.55} /><Stop offset="0.34" stopColor={c.night} stopOpacity={0} />
            <Stop offset="0.62" stopColor={palette.sky} stopOpacity={0} /><Stop offset="1" stopColor={palette.sky} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" fill={`url(#p${chapter.id})`} />
        </Svg>
        <Grain opacity={0.2} />
        <Text style={styles.characterName}>{scene.name}</Text>
      </> : <PosterArt id={chapter.id} palette={palette} />}
      <Text style={styles.posterNumber}>{String(chapter.number).padStart(2, '0')}</Text>
      {!chapter.open && <View style={styles.lock}><LockIcon color={c.night} /></View>}
    </Pressable>
    <View pointerEvents="none" style={[styles.posterLabel, { left: onRight ? 18 : width - 18 - 170, top: y + 76 }]}>
      <Text style={styles.posterKicker}>{`פרק ${chapter.number} · ${chapter.open ? 'פתוח' : 'נעול'}`}</Text>
      <Text style={[styles.posterTitle, !chapter.open && { color: '#FFF3DCB3' }]}>{chapter.title}</Text>
    </View>
  </>;
}

function PosterArt({ id, palette }: { id: string; palette: typeof PALETTES[number] }) {
  return <>
    <Svg width={POSTER.width - 12} height={POSTER.height - 12} viewBox="0 0 136 184">
      <G opacity={0.18} fill={c.cream}>
        {Array.from({ length: 8 }, (_, i) => <Path key={i} d="M68 104 65 0h6Z" transform={`rotate(${i * 45} 68 104)`} />)}
      </G>
      <Circle cx={68} cy={104} r={34} fill={palette.sun} />
      <Rect x={30} y={112} width={76} height={3} fill={palette.sky} /><Rect x={30} y={120} width={76} height={4} fill={palette.sky} />
      <Path d="M0 140 26 112l14 14 22-30 22 28 16-14 36 34V184H0Z" fill={palette.ridge} />
      <Path d="M0 156c22-6 44 4 68-2s46-6 68 0V184H0Z" fill={palette.sea} />
      <G transform="translate(55 91) scale(1.08)" fill="none" stroke={palette.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {(chapterIcons[id] ?? []).map(d => <Path key={d} d={d} />)}
      </G>
    </Svg>
    <View style={styles.pendingImage}><Text style={styles.pendingImageText}>דמות ותמונה ייווצרו עם הפרק</Text></View>
  </>;
}

function Stamp({ stamp, width, reduceMotion, onPress }: { stamp: PlacedStamp; width: number; reduceMotion: boolean; onPress: () => void }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (stamp.current && !reduceMotion) pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [pulse, stamp.current, reduceMotion]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.9 }] }));
  const onRight = stamp.x > width / 2;
  return <>
    <View style={{ position: 'absolute', left: stamp.x - STAMP / 2, top: stamp.y - STAMP / 2, width: STAMP, height: STAMP }}>
      {stamp.current && <Animated.View pointerEvents="none" style={[styles.pulse, pulseStyle]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={`יחידה ${stamp.index + 1}: ${stamp.title}`} onPress={onPress}
        style={({ pressed }) => [styles.stamp, { backgroundColor: stamp.current ? c.gold : c.cream, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
        <Svg width={STAMP} height={STAMP} style={StyleSheet.absoluteFill}>
          <Circle cx={STAMP / 2} cy={STAMP / 2} r={31} stroke={c.night} strokeWidth={1.6} strokeDasharray="3 3" fill="none" />
        </Svg>
        <Text style={styles.stampNumber}>{stamp.index + 1}</Text>
      </Pressable>
    </View>
    <Text pointerEvents="none" style={[styles.stampTitle, { top: stamp.y - 10 },
      onRight ? { left: stamp.x - STAMP / 2 - 160, textAlign: 'right' } : { left: stamp.x + STAMP / 2 + 10, textAlign: 'left' }]}>{stamp.title}</Text>
  </>;
}

function Sheet({ selection, bottomInset, onClose, onStartUnit }: {
  selection: NonNullable<Selection>; bottomInset: number; onClose: () => void; onStartUnit?: () => void;
}) {
  let kicker: string, title: string, body: string, units: string[] = [], action: 'start' | 'soon' | 'locked' | 'none';
  if (selection.kind === 'stamp') {
    const { stamp } = selection;
    kicker = `פרק 1 · יחידה ${stamp.index + 1} מתוך 3`;
    title = stamp.title;
    if (stamp.current) { body = '[תיאור היחידה מתוך התוכן המאושר]'; action = onStartUnit ? 'start' : 'soon'; }
    else { body = `החותמת תיפתח אחרי יחידה ${stamp.index}.`; action = 'locked'; }
  } else {
    const { chapter } = selection.poster;
    kicker = `פרק ${chapter.number} · ${chapter.unitTitles.length} יחידות${chapter.open ? ' · פתוח' : ''}`;
    title = chapter.title;
    units = chapter.unitTitles;
    body = chapter.open ? 'מתחילים מהחותמת הזהובה.' : 'הפוסטר ייפתח אחרי הפרקים שלפניו. בפרק הזה:';
    action = chapter.open ? 'none' : 'locked';
  }
  return <>
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="סגירה" style={StyleSheet.absoluteFill} onPress={onClose} />
    </Animated.View>
    <Animated.View entering={SlideInDown.duration(320)} exiting={SlideOutDown.duration(200)} accessibilityViewIsModal
      style={[styles.sheet, { paddingBottom: bottomInset + 24 }]}>
      <View style={styles.handle} />
      <Text style={styles.sheetKicker}>{kicker}</Text>
      <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
      <Text style={styles.sheetBody}>{body}</Text>
      {units.map((u, i) => <Text key={u} style={styles.sheetUnit}>{`${i + 1}. ${u}`}</Text>)}
      {action === 'start' && <Pressable accessibilityRole="button" onPress={() => { onClose(); onStartUnit?.(); }}
        style={({ pressed }) => [styles.sheetButton, pressed && { opacity: 0.85 }]}><Text style={styles.sheetButtonLabel}>יוצאים לדרך</Text></Pressable>}
      {(action === 'locked' || action === 'soon') && <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[styles.sheetButton, styles.sheetButtonOff]}>
        <Text style={[styles.sheetButtonLabel, { color: c.inkMuted }]}>{action === 'soon' ? 'השיעור יעלה בקרוב' : selection.kind === 'stamp' ? 'בהמשך הדרך' : 'בקרוב'}</Text>
      </View>}
    </Animated.View>
  </>;
}

function LockIcon({ color }: { color: string }) {
  return <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
    <Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { fontFamily: f.bold, fontSize: 11, letterSpacing: 3, color: c.gold, writingDirection: 'ltr' },
  title: { fontFamily: f.poster, fontSize: 46, lineHeight: 46, color: c.cream, writingDirection: 'rtl' },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { fontFamily: f.bold, fontSize: 13, color: c.gold, borderColor: c.gold, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden', writingDirection: 'rtl' },
  accountButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#FFF3DC55', alignItems: 'center', justifyContent: 'center' },
  poster: { position: 'absolute', width: POSTER.width, height: POSTER.height, borderWidth: 6, borderColor: c.cream, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 14 } },
  posterNumber: { position: 'absolute', top: 6, right: 10, fontFamily: f.poster, fontSize: 44, lineHeight: 44, color: c.cream, textShadowColor: '#00000033', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  lock: { position: 'absolute', top: 10, left: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center' },
  sceneImage: { position: 'absolute', top: 0, left: 0, width: POSTER.width - 12, height: POSTER.height - 12 },
  characterName: { position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontFamily: f.poster, fontSize: 26, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  pendingImage: { position: 'absolute', bottom: 6, left: 6, right: 6, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 6, backgroundColor: '#0D3B40B3' },
  pendingImageText: { fontFamily: f.body, fontSize: 9, lineHeight: 12, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  posterLabel: { position: 'absolute', width: 170, alignItems: 'center', gap: 2 },
  posterKicker: { fontFamily: f.bold, fontSize: 12, color: c.gold, writingDirection: 'rtl' },
  posterTitle: { fontFamily: f.bold, fontSize: 15, lineHeight: 20, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  pulse: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: STAMP, backgroundColor: c.gold },
  stamp: { width: STAMP, height: STAMP, borderRadius: STAMP / 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 10 } },
  stampNumber: { fontFamily: f.poster, fontSize: 40, lineHeight: 44, color: c.night },
  stampTitle: { position: 'absolute', width: 150, fontFamily: f.medium, fontSize: 14, color: c.cream, writingDirection: 'rtl' },
  finish: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  finishTitle: { fontFamily: f.poster, fontSize: 48, lineHeight: 48, color: c.gold, writingDirection: 'ltr' },
  finishText: { fontFamily: f.body, fontSize: 15, color: '#FFF3DCB3', writingDirection: 'rtl' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#0D1E21B3' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 14, gap: 8 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#0D3B4033', marginBottom: 6 },
  sheetKicker: { fontFamily: f.bold, fontSize: 13, color: '#B4462E', writingDirection: 'rtl' },
  sheetTitle: { fontFamily: f.poster, fontSize: 44, lineHeight: 44, color: c.night, writingDirection: 'rtl' },
  sheetBody: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.inkMuted, writingDirection: 'rtl' },
  sheetUnit: { fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.night, writingDirection: 'rtl' },
  sheetButton: { marginTop: 8, height: 56, borderRadius: 16, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
  sheetButtonOff: { backgroundColor: '#0D3B401A' },
  sheetButtonLabel: { fontFamily: f.bold, fontSize: 18, color: c.gold, writingDirection: 'rtl' },
});
