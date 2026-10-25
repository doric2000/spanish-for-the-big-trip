import { useEffect, useRef, useState } from 'react';
import { type AudioSource, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { playAudible } from '../audio-playback';

// The playback flow shared by every lesson screen: play from the start, pause, and an
// explained reload when loading or playing fails. Each screen draws its own control.
export function usePlayback(source: AudioSource) {
  const player = useAudioPlayer(source, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const actionInProgress = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function toggle() {
    if (actionInProgress.current) return;
    actionInProgress.current = true; setBusy(true); setError(null);
    try {
      if (player.playing) { player.pause(); return; }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (!active.current) return;
      await player.seekTo(0);
      if (!active.current) return;
      playAudible(player);
    } catch {
      if (active.current) setError('לא הצלחנו להשמיע את הדוגמה. אפשר לטעון אותה שוב.');
    } finally {
      actionInProgress.current = false;
      if (active.current) setBusy(false);
    }
  }
  function reload() {
    setError(null);
    try { player.replace(source); }
    catch { setError('הטעינה לא הצליחה. אפשר לנסות שוב.'); }
  }
  const failure = error ?? (status.error ? 'לא הצלחנו לטעון את הדוגמה.' : null);
  return { playing: status.playing, loaded: status.isLoaded, busy, failure, toggle: () => { void toggle(); }, reload };
}
