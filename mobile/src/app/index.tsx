import { router } from 'expo-router';
import AudioLab from '../audio-lab';

export default function Home() {
  // Unpublished authoring preview is unavailable in production.
  if (__DEV__) {
    const OpeningPreview: typeof import('../lesson/opening-preview').default =
      require('../lesson/opening-preview').default;
    return <OpeningPreview onOpenRecorder={() => router.push('/recorder')} onOpenAccount={() => router.push('/account')} />;
  }
  return <AudioLab />;
}
