import { router } from 'expo-router';
import AudioLab from '../audio-lab';

export default function Recorder() {
  return <AudioLab onBack={() => router.back()} />;
}
