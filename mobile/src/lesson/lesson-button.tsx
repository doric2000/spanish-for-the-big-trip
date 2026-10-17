import { Pressable, StyleSheet, Text } from 'react-native';
import { retro } from '../theme';

// Figma "Lesson / Button" 77:344. Primary = gold on night teal, the screen's main
// action. The other variants (secondary, dark, audio) are added with the templates
// that use them.
const c = retro.colors;

export function LessonButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  primary: { minHeight: 56, borderRadius: 16, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  label: { fontFamily: retro.fonts.bold, fontSize: 18, lineHeight: 24, color: c.night, textAlign: 'center', writingDirection: 'rtl' },
});
