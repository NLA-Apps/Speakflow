# Architecture

המסלול הקריטי הוא: iPhone → backend token endpoint → OpenAI `client_secrets`; לאחר מכן iPhone → OpenAI `realtime/calls` ישירות ב־WebRTC. השרת אינו proxy לאודיו ולכן אינו מוסיף hop ל־media path.

`RealtimeWebRTCService` מבודד את `react-native-webrtc`: microphone track, peer connection, SDP, data channel, cancel ו־cleanup. `ConversationProvider` מנהל reducer מפורש, תמלולים ומדדים. Settings נשמרים ב־AsyncStorage; תמלולים נשארים בזיכרון בלבד.

נבחר פרוטוקול WebRTC הישיר ולא Agents SDK: ה־SDK אינו נדרש למשימה, והפרוטוקול הרשמי מאפשר שליטה ב־native audio וב־peer lifecycle. נבחר Expo SDK 56 משום ש־`@config-plugins/react-native-webrtc` 15 מצהיר `expo ^56`; Expo 57 חדש יותר אך אינו שילוב peer-compatible בעת יצירת הפרויקט. New Architecture כבויה כרגע משום ש־React Native Directory עדיין מסמן את `react-native-webrtc` כלא־בדוק בה; החרגת Expo Doctor מתועדת ומוגבלת לחבילה זו בלבד.

אין תיקיות `ios/`/`android/` במאגר. EAS Prebuild מפעיל את config plugins (CNG) ובונה native project עקבי.

תוסף WebRTC מוסיף כברירת מחדל הרשאות מצלמה/אחסון אף שהמוצר הוא audio-only. התוסף המקומי `withAudioOnlyWebRTC` רץ אחריו ומסיר מ־iOS את `NSCameraUsageDescription` ומ־Android את CAMERA ו־READ/WRITE_EXTERNAL_STORAGE; הרשאת המיקרופון נשארת.
