import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { retro } from '../theme';
import { LessonButtonRow, LessonDarkButton, LessonSheetSecondaryButton } from './lesson-button';

// Shared by the checks that the server marks right or wrong (listen-select, arrange,
// scenario): the success stamp, the bottom sheet's rise, the sheets that offer "ממשיכים",
// and the retry note with its short flash.
const c = retro.colors;
const f = retro.fonts;
const STAMP = 116;

// Bottom sheet rise (Figma "Lesson / Feedback" 78:321): up in 0.34s, still under reduced motion.
export function useSheetRise() {
  const reduceMotion = useReducedMotion();
  const rise = useSharedValue(reduceMotion ? 0 : 1);
  useEffect(() => {
    if (!reduceMotion) rise.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, rise]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: rise.value * 160 }] }));
}

// Success: cream, the server's message, "חזרה" and "ממשיכים". "ממשיכים" is only
// navigation: the correct answer already moved the saved progress on.
export function SuccessSheet({ messageHe, bottomInset, onContinue, onBack }: { messageHe: string; bottomInset: number; onContinue: () => void; onBack: () => void }) {
  const style = useSheetRise();
  return <Animated.View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 20) + 14 }, style]}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.successText}>{messageHe}</Text>
    <SheetActions onContinue={onContinue} onBack={onBack} />
  </Animated.View>;
}

// Retry (Figma Retry on 89:1838, 84:1014 and 88:1844, approved by Dor 2026-10-28): no
// sheet. The wrong answer lights up pink for a moment, then the server's message stays
// under the answers and the learner answers again; "חזרה" stays a plain button below.
export const RETRY_FLASH_MS = 1200;

// The answer that is lit up as wrong right now, or null. Each flash restarts the timer,
// and leaving the screen clears it.
export function useRetryFlash<T>() {
  const [flashing, setFlashing] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = useCallback((value: T) => {
    if (timer.current) clearTimeout(timer.current);
    setFlashing(value);
    timer.current = setTimeout(() => setFlashing(null), RETRY_FLASH_MS);
  }, []);
  return [flashing, flash] as const;
}

// The server's retry message, under the answers. Give it a new key on each wrong answer so
// VoiceOver reads it again.
export function RetryNote({ messageHe }: { messageHe: string }) {
  return <View style={styles.retryNote}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.retryText}>{messageHe}</Text>
  </View>;
}

// A solved check seen again: nothing to answer, only the way forward.
export function ContinueSheet({ bottomInset, onContinue, onBack }: { bottomInset: number; onContinue: () => void; onBack: () => void }) {
  return <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 20) + 14 }]}>
    <SheetActions onContinue={onContinue} onBack={onBack} />
  </View>;
}

// Right to left: "חזרה" on the right, the main action on the left at twice its width.
function SheetActions({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  return <LessonButtonRow>
    <View style={styles.back}><LessonSheetSecondaryButton label="חזרה" onPress={onBack} /></View>
    <View style={styles.next}><LessonDarkButton label="ממשיכים" onPress={onContinue} /></View>
  </LessonButtonRow>;
}

// Success rubber stamp (Figma "Lesson / Stamp" 77:346), rotated −14°. It slams in from
// 2.4× with an overshoot, and appears still under reduced motion. The caller places it.
export function Stamp({ code, style }: { code: string; style: object }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 2.4);
  useEffect(() => {
    if (!reduceMotion) scale.value = withSpring(1, { damping: 9, stiffness: 220 });
  }, [reduceMotion, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: '-14deg' }, { scale: scale.value }] }));
  return <Animated.View style={[styles.stamp, style, animated]} accessible accessibilityLabel="נכון">
    <Svg style={styles.stampRing} width={100} height={100} accessible={false}>
      <Circle cx={50} cy={50} r={49.25} stroke={c.stamp} strokeWidth={1.5} fill="none" />
    </Svg>
    <Text style={styles.stampCode}>{code}</Text>
    <CheckIcon size={42} color={c.stamp} />
    <Text style={styles.stampCode}>✓ OK</Text>
  </Animated.View>;
}

export function CheckIcon({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
    <Path d="M4.5 12.5L9.5 17.5L19.5 6.5" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" stroke={color} />
  </Svg>;
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 22, paddingHorizontal: 24, backgroundColor: c.cream, gap: 14 },
  retryNote: { backgroundColor: c.pink, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  retryText: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.plum, writingDirection: 'rtl' },
  successText: { fontFamily: f.bold, fontSize: 19, lineHeight: 28, color: c.night, writingDirection: 'rtl' },
  back: { flex: 1 },
  next: { flex: 2 },
  stamp: {
    position: 'absolute', width: STAMP, height: STAMP, borderRadius: STAMP / 2,
    backgroundColor: c.cream, borderWidth: 4, borderColor: c.stamp, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  stampRing: { position: 'absolute', top: 4, start: 4 },
  stampCode: { fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.stamp, textAlign: 'center', writingDirection: 'ltr' },
});
