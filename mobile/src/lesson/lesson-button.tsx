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

// Secondary on a feedback sheet (Figma "Lesson / Feedback" Back 114:2205): outlined
// night teal on cream or pink, full 56pt touch target.
export function LessonSheetSecondaryButton(props: Common) {
  return <Base {...props} style={styles.sheetSecondary} labelStyle={styles.onGold} />;
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

// Audio style with the microphone (Figma Speak "Record" 87:1452): starts a new take.
export function LessonRecordButton(props: Common) {
  return <Base {...props} style={styles.audio} labelStyle={styles.onSunset}>
    <MicIcon size={20} color={c.plum} />
  </Base>;
}

// Figma "Icon / Mic" 77:243, drawn on a 48pt grid.
export function MicIcon({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessible={false}>
    <Path d="M30 12C30 8.68629 27.3137 6 24 6C20.6863 6 18 8.68629 18 12V22C18 25.3137 20.6863 28 24 28C27.3137 28 30 25.3137 30 22V12Z" fill={color} />
    <Path d="M11 22C11 25.4478 12.3696 28.7544 14.8076 31.1924C17.2456 33.6304 20.5522 35 24 35M24 35C27.4478 35 30.7544 33.6304 33.1924 31.1924C35.6304 28.7544 37 25.4478 37 22M24 35V42M24 42H17M24 42H31"
      strokeWidth={size < 30 ? 4 : 2.2} strokeLinecap="round" stroke={color} />
  </Svg>;
}

export function LessonButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: c.gold },
  secondary: { borderWidth: 1.5, borderColor: c.cream },
  outline: { minHeight: 48, borderWidth: 1.5, borderColor: c.night },
  sheetSecondary: { borderWidth: 1.5, borderColor: c.night },
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
