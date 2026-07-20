# OpenAI Realtime GA

השרת שולח `POST https://api.openai.com/v1/realtime/client_secrets` עם מפתח קבוע, `expires_after`, session מסוג `realtime`, מודל, הוראות, transcription, voice ו־turn detection. התשובה מסוננת ל־`clientSecret`, `expiresAt`, `model`.

המובייל יוצר `RTCPeerConnection`, מוסיף track מהמיקרופון ו־data channel בשם `oai-events`, יוצר offer ושולח SDP ישירות ל־`POST https://api.openai.com/v1/realtime/calls` עם ה־client secret. answer SDP מוגדר כ־remote description. אין WebSocket audio ואין pipeline של קובץ→STT→TTS.

Server VAD מוגדר עם `interrupt_response: true`. לחצן interruption שולח `response.cancel`. במצב ידני האפליקציה מפעילה את track בזמן לחיצה ושולחת `input_audio_buffer.commit` ולאחריו `response.create` בשחרור.

אירועי speech/transcription/response מזינים את ה־state ואת המדדים. latency לא מוצג אם האירוע המתאים לא התקבל; אין ערכי דמה.
