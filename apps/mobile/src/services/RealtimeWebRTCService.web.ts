import type { ClientSecretRequest, RecognitionLanguage } from '@speakingflow/shared';
import { fetchClientSecret } from './api';
import { parseRealtimeEvent, type RealtimeEvent } from './realtimeEvents';

export interface RealtimeCallbacks {
  onEvent: (event: RealtimeEvent) => void;
  onConnection: (state: string, ice: string, signaling: string) => void;
  onMetric: (name: 'token' | 'connect' | 'firstAudio', ms: number) => void;
  onError: (message: string) => void;
}

export class RealtimeWebRTCService {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private cancelled = false;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private pendingEvents: string[] = [];

  constructor(private callbacks: RealtimeCallbacks) {}

  async connect(input: ClientSecretRequest): Promise<string> {
    if (this.peer) throw new Error('A session is already active');
    this.cancelled = false;
    const tokenStart = Date.now();
    const secret = await fetchClientSecret(input);
    if (this.cancelled) throw new Error('Session cancelled');
    this.callbacks.onMetric('token', Date.now() - tokenStart);

    const connectStart = Date.now();
    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.addEventListener('connectionstatechange', () => this.reportState());
    peer.addEventListener('iceconnectionstatechange', () => this.reportState());
    const remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('playsinline', 'true');
    remoteAudio.style.display = 'none';
    document.body.appendChild(remoteAudio);
    this.remoteAudio = remoteAudio;
    peer.addEventListener('track', (event) => {
      const [remoteStream] = event.streams;
      remoteAudio.srcObject = remoteStream ?? new MediaStream([event.track]);
      void remoteAudio.play().catch(() => {
        document.addEventListener(
          'pointerdown',
          () => {
            void remoteAudio.play();
          },
          { once: true },
        );
      });
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    if (this.cancelled) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Session cancelled');
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone audio track');
    // The session may connect in the background, but no microphone audio is
    // transmitted until the user explicitly starts a push-to-talk turn.
    track.enabled = false;
    peer.addTrack(track, stream);

    const channel = peer.createDataChannel('oai-events');
    this.channel = channel;
    channel.addEventListener('open', () => {
      const pending = this.pendingEvents.splice(0);
      pending.forEach((event) => channel.send(event));
    });
    channel.addEventListener('message', (message) => {
      const event = parseRealtimeEvent(String(message.data ?? ''));
      if (event) this.callbacks.onEvent(event);
    });
    channel.addEventListener('error', () =>
      this.callbacks.onError('Realtime data channel failed'),
    );

    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${secret.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!response.ok) throw new Error(`OpenAI WebRTC negotiation failed (${response.status})`);
    await peer.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: await response.text() }),
    );
    // setRemoteDescription only completes SDP negotiation. On a cold browser
    // start the data channel can still be connecting for a short time, so do
    // not tell the UI that the conversation is ready until it can actually
    // carry events.
    await this.waitForDataChannel(channel, peer);
    this.callbacks.onMetric('connect', Date.now() - connectStart);
    this.reportState();
    return secret.model;
  }

  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  getMicrophoneStream() {
    return this.stream;
  }

  setOutputMuted(muted: boolean) {
    if (this.remoteAudio) this.remoteAudio.muted = muted;
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    const event = JSON.stringify({ type, ...payload });
    if (this.channel?.readyState === 'open') this.channel.send(event);
    else if (this.channel?.readyState === 'connecting') this.pendingEvents.push(event);
    else throw new Error('Realtime channel is not open');
  }

  sendText(text: string) {
    this.send('conversation.item.create', {
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.send('response.create');
  }

  startScenario(sessionInstructions: string, openingInstructions: string) {
    this.send('session.update', {
      session: { type: 'realtime', instructions: sessionInstructions },
    });
    this.send('response.create', {
      response: {
        output_modalities: ['audio'],
        instructions: openingInstructions,
      },
    });
  }

  setRecognitionLanguage(language: RecognitionLanguage) {
    const prompt =
      language === 'en'
        ? 'The speaker is practicing conversational English. Transcribe in English using Latin letters.'
        : language === 'he'
          ? 'The speaker is speaking Hebrew. Write Hebrew only in Hebrew script and never transliterate it.'
          : 'The speaker may naturally switch between Hebrew and English. Automatically identify each language. Write Hebrew only in Hebrew script and English only in Latin script.';
    this.send('session.update', {
      session: {
        type: 'realtime',
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-transcribe',
              ...(language === 'auto' ? {} : { language }),
              prompt,
            },
          },
        },
      },
    });
  }

  submitToolOutput(callId: string, output: string) {
    this.send('conversation.item.create', {
      item: { type: 'function_call_output', call_id: callId, output },
    });
    this.send('response.create');
  }

  interrupt() {
    if (this.channel?.readyState === 'open') this.send('response.cancel');
  }

  clearInput() {
    if (this.channel?.readyState === 'open') this.send('input_audio_buffer.clear');
  }

  clearOutput() {
    if (this.channel?.readyState === 'open') this.send('output_audio_buffer.clear');
  }

  requestResponse() {
    this.send('response.create');
  }

  deleteConversationItem(itemId: string) {
    if (this.channel?.readyState === 'open')
      this.send('conversation.item.delete', { item_id: itemId });
  }

  commitManualTurn() {
    this.send('input_audio_buffer.commit');
  }

  markTurnEnded(at: number) {
    if (!this.peer) return;
    if (this.statsTimer) clearInterval(this.statsTimer);
    let baseline: number | null = null;
    const sample = async () => {
      try {
        const reports = await this.peer?.getStats();
        if (!reports) return;
        let received = 0;
        reports.forEach((report) => {
          if (
            report.type === 'inbound-rtp' &&
            (report.kind === 'audio' || report.mediaType === 'audio') &&
            typeof report.bytesReceived === 'number'
          )
            received += report.bytesReceived;
        });
        if (baseline === null) baseline = received;
        else if (received > baseline) {
          if (this.statsTimer) clearInterval(this.statsTimer);
          this.statsTimer = null;
          this.callbacks.onMetric('firstAudio', Date.now() - at);
        }
      } catch {
        if (this.statsTimer) clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
    };
    void sample();
    this.statsTimer = setInterval(() => void sample(), 120);
  }

  close() {
    this.cancelled = true;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.channel?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.peer?.close();
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
    }
    this.channel = null;
    this.pendingEvents = [];
    this.stream = null;
    this.peer = null;
    this.remoteAudio = null;
    this.reportState();
  }

  private reportState() {
    this.callbacks.onConnection(
      this.peer?.connectionState ?? 'closed',
      this.peer?.iceConnectionState ?? 'closed',
      this.peer?.signalingState ?? 'closed',
    );
  }

  private waitForDataChannel(
    channel: RTCDataChannel,
    peer: RTCPeerConnection,
    timeoutMs = 12_000,
  ) {
    if (channel.readyState === 'open') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        channel.removeEventListener('open', handleOpen);
        channel.removeEventListener('error', handleError);
        peer.removeEventListener('connectionstatechange', handleConnectionState);
      };
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error('Realtime data channel failed to open'));
      };
      const handleConnectionState = () => {
        if (peer.connectionState !== 'failed') return;
        cleanup();
        reject(new Error('WebRTC connection failed'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Realtime connection timed out'));
      }, timeoutMs);
      channel.addEventListener('open', handleOpen);
      channel.addEventListener('error', handleError);
      peer.addEventListener('connectionstatechange', handleConnectionState);
    });
  }
}
