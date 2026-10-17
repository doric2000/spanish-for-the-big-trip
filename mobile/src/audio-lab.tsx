import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Linking, StyleSheet, Text, View } from 'react-native';
import { playAudible } from './audio-playback';

export default function AudioLab({ onBack }: { onBack?: () => void } = {}) {
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const actionInProgress = useRef(false);
  const recordingCompletion = useRef<{
    resolve: (uri: string) => void;
    reject: (error: Error) => void;
  } | null>(null);

  // Keep one player: pausing it must not deactivate the recorder's iOS session.
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (status.hasError) {
      if (recordingCompletion.current) {
        recordingCompletion.current.reject(new Error(status.error ?? 'Recording failed'));
      } else {
        Alert.alert('ההקלטה הופסקה', 'אפשר לנסות להקליט שוב.');
      }
    } else if (status.isFinished && status.url) {
      if (recordingCompletion.current) {
        recordingCompletion.current.resolve(status.url);
      } else {
        player.replace({ uri: status.url });
        setRecordingUri(status.url);
      }
    }
  });
  const recorderState = useAudioRecorderState(recorder, 200);

  useEffect(() => {
    if (playerStatus.error) {
      console.warn('Audio playback failed:', playerStatus.error);
      Alert.alert('לא הצלחנו להשמיע את ההקלטה', 'אפשר לנסות להקליט מחדש.');
    }
  }, [playerStatus.error]);

  async function toggleRecording() {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setIsBusy(true);

    try {
      if (recorder.isRecording) {
        let completionTimeout: ReturnType<typeof setTimeout> | undefined;
        const completedFile = new Promise<string>((resolve, reject) => {
          recordingCompletion.current = { resolve, reject };
          completionTimeout = setTimeout(() => {
            reject(new Error('Recording finalization timed out'));
          }, 5000);
        });

        try {
          // Native stop() can return before iOS finishes writing the audio file.
          const [, uri] = await Promise.all([recorder.stop(), completedFile]);
          await setAudioModeAsync({ allowsRecording: false });
          player.replace({ uri });
          setRecordingUri(uri);
        } finally {
          clearTimeout(completionTimeout);
          recordingCompletion.current = null;
        }
        return;
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'נדרשת גישה למיקרופון',
          permission.canAskAgain
            ? 'כדי להקליט את עצמך, יש לאשר גישה למיקרופון.'
            : 'אפשר לאפשר גישה למיקרופון בהגדרות המכשיר.',
          permission.canAskAgain
            ? [{ text: 'הבנתי' }]
            : [
                { text: 'ביטול', style: 'cancel' },
                {
                  text: 'פתיחת הגדרות',
                  onPress: () => {
                    void Linking.openSettings().catch(() => {
                      Alert.alert('יש לפתוח את ההגדרות ידנית');
                    });
                  },
                },
              ]
        );
        return;
      }

      if (player.playing) player.pause();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
      });
      // Passing options creates a fresh file for each take on iOS SDK57.
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();
      setRecordingUri(null);
    } catch {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      Alert.alert('לא הצלחנו להשלים את ההקלטה', 'אפשר לנסות שוב.');
    } finally {
      actionInProgress.current = false;
      setIsBusy(false);
    }
  }

  async function togglePlayback() {
    if (actionInProgress.current || recorder.isRecording || !recordingUri) return;
    actionInProgress.current = true;
    setIsBusy(true);

    try {
      if (player.playing) {
        player.pause();
        return;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      // Start each replay from the beginning, including after the clip finishes.
      await player.seekTo(0);
      playAudible(player);
    } catch {
      Alert.alert('לא הצלחנו להשמיע את ההקלטה', 'אפשר לנסות שוב או להקליט מחדש.');
    } finally {
      actionInProgress.current = false;
      setIsBusy(false);
    }
  }

  const statusText = recorderState.isRecording
    ? `מקליטים… ${Math.floor(recorderState.durationMillis / 1000)} שניות`
    : playerStatus.playing
      ? 'מקשיבים להקלטה'
      : recordingUri
        ? playerStatus.isLoaded
          ? `ההקלטה מוכנה להשמעה · ${playerStatus.duration.toFixed(1)} שניות`
          : 'טוענים את ההקלטה…'
        : 'מוכנים להקליט';

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>ספרדית לטיול הגדול</Text>
        <Text style={styles.subtitle}>הקלטה והשמעה</Text>
        <Text style={styles.text}>הקליטו משפט קצר ואז הקשיבו לעצמכם.</Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {statusText}
        </Text>
        <Button
          title={isBusy ? 'רגע…' : recorderState.isRecording ? 'עצירת הקלטה' : 'להקליט את עצמי'}
          onPress={toggleRecording}
          disabled={isBusy}
          color={recorderState.isRecording ? '#B91C1C' : '#1D4ED8'}
        />
        <Button
          title={playerStatus.playing ? 'עצירת השמעה' : 'השמעת ההקלטה'}
          onPress={togglePlayback}
          disabled={isBusy || recorderState.isRecording || !recordingUri || !playerStatus.isLoaded}
          color="#1D4ED8"
        />
        {onBack && (
          <Button title="חזרה ליחידה" onPress={onBack} disabled={isBusy || recorderState.isRecording} color="#1D4ED8" />
        )}
        <Text style={styles.note}>ההקלטה נשמרת זמנית במכשיר שלך.</Text>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FF00FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  text: {
    fontSize: 17,
    textAlign: 'center',
    color: '#374151',
    writingDirection: 'rtl',
  },
  status: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
    writingDirection: 'rtl',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    color: '#4B5563',
    writingDirection: 'rtl',
  },
});
