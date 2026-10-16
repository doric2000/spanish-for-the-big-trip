import { useState } from 'react';
import AudioLab from './src/audio-lab';

export default function App() {
  const [recorderOpen, setRecorderOpen] = useState(false);
  // Unpublished authoring preview is unavailable in production.
  if (__DEV__ && !recorderOpen) {
    const OpeningPreview: typeof import('./src/lesson/opening-preview').default =
      require('./src/lesson/opening-preview').default;
    return <OpeningPreview onOpenRecorder={() => setRecorderOpen(true)} />;
  }
  return <AudioLab onBack={__DEV__ ? () => setRecorderOpen(false) : undefined} />;
}
