import type { ImageSourcePropType } from 'react-native';
import type { AudioSource } from 'expo-audio';

// Approved files bundled in the development build, by media id, until they are
// served from Supabase Storage. A URL from the API always wins.
const bundledImages: Record<string, ImageSourcePropType> = {
  'juan-hostel-v1': require('../../../assets/characters/juan/scenes/unit1a-entry-hostel-v1.png'),
  'juan-reference-v1': require('../../../assets/characters/juan/juan-reference-v1.png'),
};
const bundledAudio: Record<string, AudioSource> = {
  'juan-buenos-dias-v1': require('../../../assets/characters/juan/voice/unit1a-buenos-dias-audition-v4/buenos-dias.mp3'),
};

export function imageFor(assetId: string, url: string | null): ImageSourcePropType | null {
  return url ? { uri: url } : bundledImages[assetId] ?? null;
}

export function audioFor(assetId: string, url: string | null): AudioSource | null {
  return url ? { uri: url } : bundledAudio[assetId] ?? null;
}

// Where the face is in a character's approved image, in image pixels, for the round
// avatar. Juan v1: the close-up on the left of the reference sheet (1536x1024).
export type FaceCrop = { imageWidth: number; imageHeight: number; x: number; y: number; size: number };
const faceCrops: Record<string, FaceCrop> = {
  'juan-reference-v1': { imageWidth: 1536, imageHeight: 1024, x: 120, y: 40, size: 540 },
};

export function faceCropFor(assetId: string): FaceCrop | null {
  return faceCrops[assetId] ?? null;
}
