import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme';
export function Waveform({ active }: { active: boolean }) {
  const [values] = useState(() => Array.from({ length: 11 }, () => new Animated.Value(0.2)));
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || reduceMotion) {
      values.forEach((value) => value.setValue(0.2));
      return;
    }
    const animations = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 300 + index * 25,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.2,
            duration: 300 + index * 25,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [active, reduceMotion, values]);
  return (
    <View style={styles.row}>
      {values.map((value, index) => (
        <Animated.View key={index} style={[styles.bar, { transform: [{ scaleY: value }] }]} />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  bar: { width: 3, height: 24, borderRadius: 3, backgroundColor: colors.primary },
});
