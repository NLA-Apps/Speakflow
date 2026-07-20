import { View, StyleSheet, type ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';
export function Card(props: ViewProps) {
  return <View {...props} style={[styles.card, props.style]} />;
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow,
  },
});
