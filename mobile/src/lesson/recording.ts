import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { playAudible } from '../audio-playback';

// The learner records themselves and listens back, inside the lesson. The same flow as
// the recording proof in src/audio-lab.tsx, checked on Dor's iPhone: one player kept
// for the whole screen, a fresh file per take, and playback only after iOS reports the
// file finished. The file stays on the device and is never sent anywhere.
export type StartResult = 'recording' | 'failed' | { denied: true; canAskAgain: boolean };

export function useSelfRecording() {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const actionInProgress = useRef(false);
  const completion = useRef<{ resolve: (uri: string) => void; reject: (error: Error) => void } | null>(null);

  // Keep one player: pausing it must not deactivate the recorder's iOS session.
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (status.hasError) {
      if (completion.current) completion.current.reject(new Error(status.error ?? 'Recording failed'));
      else setFailure('ההקלטה הופסקה. אפשר להקליט שוב.');
    } else if (status.isFinished && status.url) {
      completion.current?.resolve(status.url);
    }
  });
  const recorderState = useAudioRecorderState(recorder, 200);

  // Leaving the screen mid-take stops the microphone and gives the speaker back.
  useEffect(() => () => {
    if (recorder.isRecording) void recorder.stop().catch(() => {});
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, [recorder]);

  // Run one native action at a time; taps during it are ignored.
  const exclusive = useCallback(async <T>(action: () => Promise<T>, fallback: T) => {
    if (actionInProgress.current) return fallback;
    actionInProgress.current = true; setBusy(true);
    try { return await action(); }
    finally { actionInProgress.current = false; setBusy(false); }
  }, []);

  const start = useCallback(() => exclusive<StartResult>(async () => {
    setFailure(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return { denied: true, canAskAgain: permission.canAskAgain };
    try {
      if (player.playing) player.pause();
      await setAudioModeAsync({
        allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false,
        allowsBackgroundRecording: false, shouldRouteThroughEarpiece: false, interruptionMode: 'doNotMix',
      });
      // Passing options creates a fresh file for each take on iOS SDK57.
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();
      setUri(null);
      return 'recording';
    } catch {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setFailure('לא הצלחנו להתחיל להקליט. אפשר לנסות שוב.');
      return 'failed';
    }
  }, 'failed'), [exclusive, player, recorder]);

  // Resolves true once the take is ready to play.
  const stop = useCallback(() => exclusive(async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finished = new Promise<string>((resolve, reject) => {
      completion.current = { resolve, reject };
      timeout = setTimeout(() => reject(new Error('Recording finalization timed out')), 5000);
    });
    try {
      // Native stop() can return before iOS finishes writing the audio file.
      const [, file] = await Promise.all([recorder.stop(), finished]);
      await setAudioModeAsync({ allowsRecording: false });
      player.replace({ uri: file });
      setUri(file);
      return true;
    } catch {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setFailure('לא הצלחנו לשמור את ההקלטה. אפשר להקליט שוב.');
      return false;
    } finally {
      clearTimeout(timeout);
      completion.current = null;
    }
  }, false), [exclusive, player, recorder]);

  const togglePlayback = useCallback(() => exclusive(async () => {
    if (recorder.isRecording || !uri) return;
    if (player.playing) { player.pause(); return; }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      // Each replay starts from the beginning, including after the take finished.
      await player.seekTo(0);
      playAudible(player);
    } catch {
      setFailure('לא הצלחנו להשמיע את ההקלטה. אפשר להקליט שוב.');
    }
  }, undefined), [exclusive, player, recorder, uri]);

  // Stops this take when the model starts. Stable, so an effect can call it.
  const pause = useCallback(() => { if (player.playing) player.pause(); }, [player]);

  const duration = playerStatus.duration || 0;
  return {
    recording: recorderState.isRecording, recordedMillis: recorderState.durationMillis, uri, busy, failure,
    playing: playerStatus.playing, loaded: playerStatus.isLoaded, takeSeconds: duration,
    // How much of the take has played, 0..1, to colour the wave.
    progress: duration > 0 ? Math.min(1, playerStatus.currentTime / duration) : 0,
    start, stop, togglePlayback, pause,
  };
}
