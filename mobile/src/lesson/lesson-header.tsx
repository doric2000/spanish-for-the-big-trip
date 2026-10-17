import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Plane } from '../retro/art';
import { retro } from '../theme';

// Lesson shell top bar (Figma "Lesson / Header" 77:288): close on the right, the
// flight-path progress with step 1 at the right, and the activity code on the left.
const c = retro.colors;
const DOT = 16;

type Props = { code: string; index: number; count: number; onClose: () => void; topInset: number };

export function LessonHeader({ code, index, count, onClose, topInset }: Props) {
  const [width, setWidth] = useState(0);
  // One slot per activity. A unit can have more activities than fit at 16pt each,
  // so the slots shrink to the measured width; the dots themselves keep their size.
  const slot = count > 0 ? Math.min(DOT, width / count) : DOT;
  return <View style={[styles.bar, { paddingTop: topInset + 4 }]}>
    {/* In the right-to-left row the first child sits on the right. */}
    <Pressable accessibilityRole="button" accessibilityLabel="יציאה מהשיעור" onPress={onClose} hitSlop={8}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Svg width={18} height={18} viewBox="0 0 18 18" accessible={false}>
        <Path d="M4.5 4.5L9 9M9 9L13.5 13.5M9 9L13.5 4.5M9 9L4.5 13.5" stroke={c.cream} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </Pressable>
    <View style={styles.progress} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible accessibilityRole="progressbar" accessibilityLabel={`פעילות ${index + 1} מתוך ${count}`}>
      {width > 0 && <>
        <Svg style={StyleSheet.absoluteFill} width={width} height={28} accessible={false}>
          <Line x1={slot / 2} x2={width - slot / 2} y1={14} y2={14} stroke={c.cream} strokeWidth={2} strokeDasharray="6 4" />
        </Svg>
        {Array.from({ length: count }, (_, i) => <View key={i} style={[styles.slot, { width: slot }]}>
          {i === index ? <View style={styles.plane}><Plane size={22} color={c.gold} /></View>
            : <Svg width={DOT} height={28} viewBox="0 0 16 28" accessible={false}>
              {i < index ? <Circle cx={8} cy={14} r={4} fill={c.gold} />
                // A night fill hides the route line inside the ring.
                : <Circle cx={8} cy={14} r={2.25} fill={c.night} stroke={c.cream} strokeWidth={1.5} />}
            </Svg>}
        </View>)}
      </>}
    </View>
    <Text style={styles.code}>{code}</Text>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.cream, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  // The dots spread over the whole route, step 1 at the right.
  progress: { flex: 1, height: 28, flexDirection: 'row', justifyContent: 'space-between' },
  slot: { height: 28, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  plane: { width: 22, height: 22, backgroundColor: c.night, borderRadius: 11 },
  code: { fontFamily: retro.fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.gold, writingDirection: 'ltr' },
});
