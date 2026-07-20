import { Ionicons } from '@expo/vector-icons';
import { AudioModule } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScaffold } from '@/components/AppScaffold';
import { healthCheck } from '@/services/api';
import { colors, radius, spacing, typography } from '@/theme';
import { useConversation } from '@/state/conversation';
import type { ConversationScenario } from '@speakingflow/shared';

const starters = [
  'Hi Sky! How are you today?',
  'I want to talk about my day',
  "Let's talk about movies",
];

export default function HomeScreen() {
  const [ready, setReady] = useState<boolean | null>(null);
  const conversation = useConversation();
  const preconnect = conversation.start;
  const launchScenario = (scenario: ConversationScenario) => {
    router.push('/conversation');
    void conversation.startScenario(scenario);
  };
  useEffect(() => {
    void healthCheck().then(async (serverReady) => {
      setReady(serverReady);
      if (!serverReady) return;
      const permission = await AudioModule.getRecordingPermissionsAsync();
      if (permission.granted) void preconnect();
    });
  }, [preconnect]);
  return (
    <AppScaffold active="chat" contentStyle={styles.content}>
      <View style={styles.quickModes}>
        <Pressable
          style={[styles.modeChip, conversation.scenario === 'free' && styles.modeActive]}
          onPress={() => launchScenario('free')}
        >
          <Ionicons name="chatbubble" size={14} color={colors.text} />
          <Text style={conversation.scenario === 'free' ? styles.modeActiveText : styles.modeText}>שיחה חופשית</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, conversation.scenario === 'job_interview' && styles.modeActive]}
          onPress={() => launchScenario('job_interview')}
        >
          <Ionicons name="briefcase" size={14} color={conversation.scenario === 'job_interview' ? colors.text : colors.muted} />
          <Text style={conversation.scenario === 'job_interview' ? styles.modeActiveText : styles.modeText}>ראיון עבודה</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, conversation.scenario === 'restaurant' && styles.modeActive]}
          onPress={() => launchScenario('restaurant')}
        >
          <Ionicons name="restaurant" size={14} color={conversation.scenario === 'restaurant' ? colors.text : colors.muted} />
          <Text style={conversation.scenario === 'restaurant' ? styles.modeActiveText : styles.modeText}>במסעדה</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <View style={styles.waveHalo}>
          <View style={styles.avatar}>
            <Ionicons name="hand-left" size={43} color={colors.warning} />
          </View>
        </View>
        <Text style={styles.title}>Hi! I&apos;m Sky</Text>
        <Text style={styles.description}>
          אני כאן כדי לתרגל איתך אנגלית בשיחה חופשית.{`\n`}
          לחץ על המיקרופון ודבר באנגלית — אני כבר אתרגם ואעזור.
        </Text>
        <Text style={styles.tip}>💡 אפשר ללחוץ על כל מילה שאומר כדי לתרגם, לשמוע ולשמור אותה</Text>
        <View style={styles.starters}>
          {starters.map((starter) => (
            <Pressable
              key={starter}
              style={styles.starter}
              onPress={() => {
                router.push('/conversation');
                void conversation.sendText(starter);
              }}
            >
              <Text style={styles.starterText}>{starter}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.connection}>
        <View
          style={[
            styles.dot,
            { backgroundColor: ready ? colors.success : ready === false ? colors.danger : colors.warning },
          ]}
        />
        <Text style={styles.connectionText}>
          {ready ? 'Sky מוכנה לשיחה' : ready === false ? 'השרת אינו מחובר' : 'בודק חיבור…'}
        </Text>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  quickModes: { flexDirection: 'row-reverse', gap: spacing.sm, justifyContent: 'center' },
  modeChip: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  modeActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  modeActiveText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  waveHalo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: '#54489B',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.lg },
  description: {
    ...typography.body,
    color: colors.primaryLight,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: spacing.sm,
  },
  tip: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  starters: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  starter: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  starterText: { color: colors.primaryLight, fontSize: 14 },
  connection: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { color: colors.muted, fontSize: 12 },
});
