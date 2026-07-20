import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { BottomDock } from './BottomDock';
import { colors, spacing } from '@/theme';

export function AppScaffold({
  children,
  active,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{
  active: 'chat' | 'practice' | 'insights' | 'progress';
  scroll?: boolean;
  contentStyle?: ViewStyle;
}>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AppHeader />
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]}>{children}</ScrollView>
      ) : (
        <View style={[styles.fixed, contentStyle]}>{children}</View>
      )}
      <BottomDock active={active} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.md },
  fixed: { flex: 1, padding: spacing.md },
});
