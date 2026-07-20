# iOS Build

האפליקציה מוגדרת portrait, iPhone-only, גרסה 1.0.0/build 1, scheme `speakingflow` ו־bundle id `com.netanelatia.speakingflow`. הרשאת המיקרופון מוגדרת בעברית. אין background audio בגרסה זו; מעבר לרקע מסיים את השיחה בבטחה.

`react-native-webrtc` הוא native module ולכן נדרש Expo Development Build. הפעל `eas init`, לאחר מכן `eas device:create` ולבסוף `eas build --platform ios --profile development`. Preview הוא internal distribution; production מוכן ל־TestFlight/App Store.

לא ניתן להפיק או להריץ build אמיתי ל־iPhone באופן מקומי ב־Windows. EAS מבצע את בניית Xcode בענן.
