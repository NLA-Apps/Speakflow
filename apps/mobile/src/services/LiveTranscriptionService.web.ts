import type { RecognitionLanguage, TranscriptionSecretRequest } from '@speakingflow/shared';
import { fetchTranscriptionSecret } from './api';
import { parseRealtimeEvent } from './realtimeEvents';

interface Callbacks {
  onDelta: (itemId: string, delta: string) => void;
  onCompleted: (itemId: string, transcript: string) => void;
  onError: (message: string) => void;
}

export class LiveTranscriptionService {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private pendingEvents: string[] = [];

  constructor(private callbacks: Callbacks) {}

  async connect(input: TranscriptionSecretRequest, stream: MediaStream) {
    const secret = await fetchTranscriptionSecret(input);
    const peer = new RTCPeerConnection();
    this.peer = peer;
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone track for live transcription');
    peer.addTrack(track, stream);
    const channel = peer.createDataChannel('oai-transcription-events');
    this.channel = channel;
    channel.addEventListener('open', () => {
      const pending = this.pendingEvents.splice(0);
      pending.forEach((event) => channel.send(event));
    });
    channel.addEventListener('message', (message) => {
      const event = parseRealtimeEvent(String(message.data ?? ''));
      if (!event) return;
      const itemId = event.item_id ?? 'live-transcription';
      if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta)
        this.callbacks.onDelta(itemId, event.delta);
      if (
        event.type === 'conversation.item.input_audio_transcription.completed' &&
        event.transcript
      )
        this.callbacks.onCompleted(itemId, event.transcript);
      if (event.type === 'error')
        this.callbacks.onError(event.error?.message ?? 'Live transcription failed');
    });
    channel.addEventListener('error', () =>
      this.callbacks.onError('Live transcription data channel failed'),
    );
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${secret.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!response.ok)
      throw new Error(`OpenAI live transcription negotiation failed (${response.status})`);
    await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  }

  private send(type: string, payload: Record<string, unknown> = {}) {
    const event = JSON.stringify({ type, ...payload });
    if (this.channel?.readyState === 'open') this.channel.send(event);
    else if (this.channel?.readyState === 'connecting') this.pendingEvents.push(event);
  }

  commit() {
    this.send('input_audio_buffer.commit');
  }

  clear() {
    this.send('input_audio_buffer.clear');
  }

  setLanguage(language: RecognitionLanguage) {
    if (language === 'auto') return;
    this.send('session.update', {
      session: {
        type: 'transcription',
        audio: {
          input: {
            transcription: {
              model: 'gpt-realtime-whisper',
              language,
              delay: 'minimal',
            },
          },
        },
      },
    });
  }

  close() {
    this.channel?.close();
    this.peer?.close();
    this.channel = null;
    this.peer = null;
    this.pendingEvents = [];
  }
}
