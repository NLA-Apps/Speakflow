import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function AppHeader() {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconButton} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={21} color={colors.muted} />
      </Pressable>
      <View style={styles.level}>
        <Text style={styles.levelText}>A1</Text>
      </View>
      <View style={styles.streak}>
        <Text style={styles.streakText}>0</Text>
        <Ionicons name="flame" size={17} color={colors.warning} />
      </View>
      <Text style={styles.brand}>SpeakFlow</Text>
      <Pressable style={styles.mic} onPress={() => router.push('/conversation')}>
        <Ionicons name="mic" size={21} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  level: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelText: { color: colors.primaryLight, fontWeight: '800' },
  streak: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#211C12',
    borderWidth: 1,
    borderColor: '#67521C',
  },
  streakText: { color: colors.warning, fontWeight: '800' },
  brand: { flex: 1, color: colors.primaryLight, fontSize: 19, fontWeight: '800', textAlign: 'right' },
  mic: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
