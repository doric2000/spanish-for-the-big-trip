import { type ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Plane } from '../retro/art';
import { retro } from '../theme';
import type { FaceCrop } from './media';

// Figma "Lesson / Avatar" 77:345: the character's face from its approved image, in a
// cream ring. 44pt by default; the dialogue uses 56pt.
export function LessonAvatar({ source, crop, size = 44 }: { source: ImageSourcePropType; crop: FaceCrop; size?: number }) {
  const inner = size - 5;
  const scale = inner / crop.size;
  // The crop is placed in left-to-right image coordinates whatever the app direction.
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
    <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
      <Image source={source} accessible={false} contentFit="fill"
        style={{ position: 'absolute', left: -crop.x * scale, top: -crop.y * scale, width: crop.imageWidth * scale, height: crop.imageHeight * scale }} />
    </View>
  </View>;
}

// The learner's own mark (Figma "Learner badge" 86:881): the plane on sea in a cream
// ring. It stands for the learner wherever a character would show a face: the
// learner's lines in the dialogue and the model line in speaking practice.
export function LearnerBadge({ size = 56 }: { size?: number }) {
  return <View accessible={false} style={[styles.learner, { width: size, height: size, borderRadius: size / 2 }]}>
    <Plane size={26} color={retro.colors.cream} />
  </View>;
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 2.5, borderColor: retro.colors.cream, overflow: 'hidden', backgroundColor: retro.colors.cream },
  learner: { backgroundColor: retro.colors.sea, borderWidth: 3, borderColor: retro.colors.cream, alignItems: 'center', justifyContent: 'center' },
});
