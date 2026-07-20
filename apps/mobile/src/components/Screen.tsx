import { type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
export function Screen({
  children,
  scroll = false,
  style,
}: PropsWithChildren<{ scroll?: boolean; style?: ViewStyle }>) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, style]}>{children}</ScrollView>
  ) : (
    <View style={[styles.content, style]}>{children}</View>
  );
  return <SafeAreaView style={styles.safe}>{content}</SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg },
});
