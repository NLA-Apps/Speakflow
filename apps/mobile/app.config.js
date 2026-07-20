/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'SpeakingFlow',
  slug: 'speakingflow',
  owner: 'speakingflow',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'speakingflow',
  userInterfaceStyle: 'dark',
  newArchEnabled: false,
  runtimeVersion: '1.0.0',
  icon: './assets/images/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.netanelatia.speakingflow',
    buildNumber: '1',
    infoPlist: { UIBackgroundModes: [] },
  },
  plugins: [
    'expo-router',
    'expo-asset',
    '@config-plugins/react-native-webrtc',
    './plugins/withAudioOnlyWebRTC',
    [
      'expo-audio',
      {
        microphonePermission:
          'SpeakingFlow משתמשת במיקרופון כדי לאפשר תרגול שיחה חי בעברית ובאנגלית.',
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
    eas: {
      projectId: '63df7033-8af0-4b8a-bdf9-3a2dc0b61fae',
    },
  },
};
