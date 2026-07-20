import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { VoicePreference } from '@speakingflow/shared';
import { createSpeech } from '@/services/api';

interface PronunciationOptions {
  voice?: VoicePreference;
  speed?: number;
  onReady?: () => void;
}

let activePlayer: AudioPlayer | null = null;
let requestVersion = 0;

function stopPlayer() {
  if (!activePlayer) return;
  activePlayer.pause();
  activePlayer.remove();
  activePlayer = null;
}

export function stopPronunciation() {
  requestVersion += 1;
  stopPlayer();
  Speech.stop();
}

function speakWithDeviceVoice(text: string, options: PronunciationOptions) {
  const isHebrew = /[\u0590-\u05ff]/.test(text);
  Speech.stop();
  Speech.speak(text, {
    language: isHebrew ? 'he-IL' : 'en-US',
    rate: Math.max(0.7, Math.min(1.1, 0.86 * (options.speed ?? 1))),
    pitch: options.voice === 'male' ? 0.88 : 1.04,
  });
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export async function pronounceText(text: string, options: PronunciationOptions = {}) {
  const cleaned = text.trim();
  if (!cleaned) return;
  stopPronunciation();
  const version = requestVersion;
  let readyAnnounced = false;
  const announceReady = async () => {
    if (!readyAnnounced) {
      readyAnnounced = true;
      options.onReady?.();
    }
    await waitForNextPaint();
  };
  try {
    const audioUrl = await createSpeech({
      text: cleaned,
      voice: options.voice ?? 'female',
      speakingSpeed: options.speed ?? 1,
    });
    if (version !== requestVersion) return;
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
    const player = createAudioPlayer({ uri: audioUrl });
    if (version !== requestVersion) {
      player.remove();
      return;
    }
    activePlayer = player;
    await announceReady();
    if (version !== requestVersion) return;
    player.play();
  } catch {
    if (version === requestVersion) {
      await announceReady();
      speakWithDeviceVoice(cleaned, options);
    }
  }
}

export function pronounceEnglish(text: string) {
  void pronounceText(text);
}
