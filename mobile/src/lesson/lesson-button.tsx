import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { retro } from '../theme';

// Figma "Lesson / Button" 77:344. One explicit component per variant instead of
// boolean props: primary = gold on night teal (main action), secondary = outlined
// on the dark background, outline = on the cream stub, audio = sunset with plum
// text and a play or pause icon. Touch target 56pt (48pt for the stub reload).
const c = retro.colors;

type Common = { label: string; onPress: () => void; disabled?: boolean };

function Base({ label, onPress, disabled = false, style, labelStyle, busy = false, children }: Common & {
  style: object; labelStyle: object; busy?: boolean; children?: ReactNode;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.base, style, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {/* In the right-to-left row the icon comes first, at the start of the line. */}
    {busy ? <ActivityIndicator color={style === styles.primary ? c.night : c.plum} /> : <>
      {children}
      <Text style={[styles.label, labelStyle]}>{label}</Text>
    </>}
  </Pressable>;
}

// busy: waiting for the server to confirm the action; further taps are ignored.
export function LessonButton({ busy, ...props }: Common & { busy?: boolean }) {
  return <Base {...props} busy={busy} style={styles.primary} labelStyle={styles.onGold} />;
}

// The main action's save state, shared by every lesson screen.
export type SaveState = { busy: boolean; errorHe: string | null };

// Shown above the footer buttons when the server did not confirm a tap. Tapping the
// main action again resends the same request.
export function LessonSaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text>;
}

export function LessonSecondaryButton(props: Common) {
  return <Base {...props} style={styles.secondary} labelStyle={styles.onNight} />;
}

// Dark = night teal with gold text, on cream panels such as the success sheet.
export function LessonDarkButton(props: Common) {
  return <Base {...props} style={styles.dark} labelStyle={styles.onDark} />;
}

export function LessonOutlineButton(props: Common) {
  return <Base {...props} style={styles.outline} labelStyle={styles.onCream} />;
}

export function LessonAudioButton({ playing, busy, ...props }: Common & { playing: boolean; busy?: boolean }) {
  return <Base {...props} busy={busy} style={styles.audio} labelStyle={styles.onSunset}>
    {/* Media icons keep pointing right in a right-to-left layout, as on iOS. */}
    <Svg width={20} height={20} viewBox="0 0 20 20" accessible={false}>
      {playing ? <>
        <Rect x={5} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
        <Rect x={11.67} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
      </> : <Path d="M5.83333 3.75V16.25L15.8333 10L5.83333 3.75Z" fill={c.plum} />}
    </Svg>
  </Base>;
}

export function LessonButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: c.gold },
  secondary: { borderWidth: 1.5, borderColor: c.cream },
  outline: { minHeight: 48, borderWidth: 1.5, borderColor: c.night },
  dark: { backgroundColor: c.night },
  audio: { backgroundColor: c.sunset },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  label: { fontFamily: retro.fonts.bold, fontSize: 18, lineHeight: 24, textAlign: 'center', writingDirection: 'rtl' },
  onGold: { color: c.night },
  onNight: { color: c.cream },
  onCream: { color: c.night, fontSize: 16 },
  onDark: { color: c.gold },
  onSunset: { color: c.plum },
  row: { flexDirection: 'row', gap: 12 },
  error: { fontFamily: retro.fonts.medium, fontSize: 15, lineHeight: 22, color: c.pink, textAlign: 'center', writingDirection: 'rtl', marginBottom: 10 },
});
