import type { AudioPlayer } from 'expo-audio';

// expo-audio's player is a handle to the native player, and its API is set through
// properties. React's lint rule treats anything a hook returns as immutable data, so
// the property writes live here, outside components, in one place for every screen.
export function playAudible(player: Pick<AudioPlayer, 'muted' | 'volume' | 'play'>) {
  player.muted = false;
  player.volume = 1;
  player.play();
}
