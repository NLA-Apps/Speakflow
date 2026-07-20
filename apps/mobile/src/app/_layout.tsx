import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '@/state/settings';
import { DiagnosticsProvider } from '@/state/diagnostics';
import { ConversationProvider } from '@/state/conversation';
import { VocabularyProvider } from '@/state/vocabulary';
import { ActivityProvider } from '@/state/activity';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <DiagnosticsProvider>
          <VocabularyProvider>
            <ActivityProvider>
              <ConversationProvider>
                <StatusBar style="light" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'fade',
                  }}
                />
              </ConversationProvider>
            </ActivityProvider>
          </VocabularyProvider>
        </DiagnosticsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
