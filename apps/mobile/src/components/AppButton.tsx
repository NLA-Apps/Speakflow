import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
export function AppButton({
  title,
  variant = 'primary',
  ...props
}: PressableProps & { title: string; variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && styles.pressed,
        typeof props.style === 'function' ? props.style(state) : props.style,
      ]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.75 },
  text: { ...typography.body, color: colors.text, fontWeight: '700' },
});
