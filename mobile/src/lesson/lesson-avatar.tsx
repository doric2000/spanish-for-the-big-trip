import { type ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { retro } from '../theme';
import type { FaceCrop } from './media';

// Figma "Lesson / Avatar" 77:345: the character's face from its approved image, in a
// cream ring.
const SIZE = 44;

export function LessonAvatar({ source, crop }: { source: ImageSourcePropType; crop: FaceCrop }) {
  const inner = SIZE - 5;
  const scale = inner / crop.size;
  // The crop is placed in left-to-right image coordinates whatever the app direction.
  return <View style={styles.avatar}>
    <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
      <Image source={source} accessible={false} contentFit="fill"
        style={{ position: 'absolute', left: -crop.x * scale, top: -crop.y * scale, width: crop.imageWidth * scale, height: crop.imageHeight * scale }} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2.5, borderColor: retro.colors.cream, overflow: 'hidden', backgroundColor: retro.colors.cream },
});
