import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { retro } from '../theme';
import { LessonButtonRow, LessonDarkButton, LessonSheetSecondaryButton } from './lesson-button';

// Shared by the checks that the server marks right or wrong (listen-select, arrange):
// the success stamp, the bottom sheet's rise, and the sheets that offer "ממשיכים".
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

// Retry: pink, the server's message and "חזרה". Another answer stays possible above it.
export function RetrySheet({ messageHe, bottomInset, onBack }: { messageHe: string; bottomInset: number; onBack: () => void }) {
  const style = useSheetRise();
  return <Animated.View style={[styles.sheet, styles.retrySheet, { paddingBottom: Math.max(bottomInset, 20) + 24 }, style]}>
    <View style={styles.retryRow}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" accessible={false}>
        <Path d="M3 12C2.99812 14.0611 3.7037 16.0603 4.99882 17.6636C6.29394 19.2669 8.10012 20.3771 10.1155 20.8087C12.1308 21.2403 14.2333 20.967 16.0714 20.0347C17.9095 19.1023 19.3719 17.5673 20.2142 15.6862C21.0564 13.8051 21.2276 11.6919 20.6989 9.69981C20.1703 7.7077 18.9739 5.9574 17.3098 4.74142C15.6457 3.52545 13.6146 2.9175 11.556 3.01916C9.4975 3.12083 7.53622 3.92597 6 5.3" strokeWidth={2.2} strokeLinecap="round" stroke={c.plum} />
        <Path d="M3 4V8.5H7.5" strokeWidth={2.2} strokeLinecap="round" stroke={c.plum} />
      </Svg>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.retryText}>{messageHe}</Text>
    </View>
    <LessonSheetSecondaryButton label="חזרה" onPress={onBack} />
  </Animated.View>;
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
  retrySheet: { backgroundColor: c.pink },
  retryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  retryText: { flex: 1, fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.plum, writingDirection: 'rtl' },
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
