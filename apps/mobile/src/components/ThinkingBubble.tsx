import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { colors, radius, spacing } from '@/theme';

export function ThinkingBubble() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        150,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [dots]);

  return (
    <View style={styles.wrap} accessibilityLabel="Sky חושבת">
      <View style={styles.bubble}>
        <View style={styles.avatar}><Text style={styles.avatarText}>S</Text></View>
        <Text style={styles.label}>Sky חושבת</Text>
        <View style={styles.dots}>
          {dots.map((dot, index) => (
            <Animated.View key={index} style={[styles.dot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', marginVertical: spacing.xs },
  bubble: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  avatarText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primaryLight },
});
