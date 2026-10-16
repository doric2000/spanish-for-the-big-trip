import { router } from 'expo-router';
import JourneyScreen from '../map/journey-screen';

// Home: the trip map. Unit 1A is an unpublished authoring preview, so only development
// builds can open it from the map.
export default function Home() {
  return <JourneyScreen
    onOpenAccount={() => router.push('/account')}
    onStartUnit={__DEV__ ? () => router.push('/lesson') : undefined} />;
}
