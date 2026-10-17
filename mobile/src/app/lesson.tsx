import { router } from 'expo-router';
import AudioLab from '../audio-lab';

export default function Lesson() {
  // Unpublished authoring preview is unavailable in production.
  if (__DEV__) {
    // A require inside __DEV__ (not an import) keeps the draft lesson out of release bundles.
    const OpeningPreview: typeof import('../lesson/opening-preview').default =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../lesson/opening-preview').default;
    return <OpeningPreview onOpenRecorder={() => router.push('/recorder')} onOpenAccount={() => router.push('/account')}
      onClose={() => router.back()} />;
  }
  return <AudioLab />;
}
