import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, contrastText, palettes, useAppTheme } from '../theme';
import { AppSession, StudentWorkspace, ThemePalette } from '../types';
import { PrimaryButton } from './ui';
import { cloudConfigured } from '../services/supabase';

const themeOptions: Array<{ id: ThemePalette; label: string; description: string }> = [
  { id: 'feu-green', label: 'FEU Green', description: 'Classic green and gold' },
  { id: 'dark', label: 'Dark', description: 'Neutral charcoal' },
  { id: 'black-maroon', label: 'Black–Maroon', description: 'Black with deep maroon' },
  { id: 'black-orange', label: 'Black–Orange', description: 'Black with warm orange' },
  { id: 'pastel-pink', label: 'Pastel Pink', description: 'Soft rose and lavender' },
  { id: 'system', label: 'Follow device', description: 'Green or dark automatically' },
];

export function SettingsScreen({
  session,
  workspace,
  onChange,
  onReplaceCurriculum,
  onSignOut,
}: {
  session: AppSession;
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  onReplaceCurriculum: () => void;
  onSignOut: () => void;
}) {
  const theme = useAppTheme();
  const curriculum = workspace.curriculum;
  const selectedTheme = workspace.preferences?.theme ?? 'feu-green';
  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.canvas }]}>
      <Text style={[styles.eyebrow, { color: theme.green700 }]}>SETTINGS</Text>
      <Text style={[styles.title, { color: theme.ink }]}>Your planner</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Account, appearance, curriculum source, and integration status.</Text>

      <View style={[styles.profile, { backgroundColor: theme.green900 }]}>
        <View style={[styles.avatar, { backgroundColor: theme.gold }]}><Text style={[styles.avatarText, { color: contrastText(theme.gold) }]}>{session.username[0]?.toUpperCase()}</Text></View>
        <View style={styles.profileCopy}>
          <Text style={[styles.email, { color: contrastText(theme.green900) }]}>{session.username}</Text>
          <Text style={[styles.mode, { color: contrastText(theme.green900) }]}>{cloudConfigured ? `Cloud account · ${session.role ?? 'student'}` : 'Local preview account · connect Supabase for cloud sync'}</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.ink }]}>Color palette</Text>
      <View style={styles.themeGrid}>
        {themeOptions.map((option) => {
          const preview = option.id === 'system' ? palettes.dark : palettes[option.id];
          const selected = selectedTheme === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange({
                ...workspace,
                preferences: {
                  ...workspace.preferences,
                  showPrerequisiteConnectors: workspace.preferences?.showPrerequisiteConnectors ?? true,
                  cardLabel: workspace.preferences?.cardLabel ?? 'code',
                  theme: option.id,
                },
                updatedAt: new Date().toISOString(),
              })}
              style={[styles.themeChoice, { backgroundColor: preview.canvas, borderColor: selected ? theme.gold : preview.border }, selected && styles.themeSelected]}
            >
              <View style={styles.swatches}>
                <View style={[styles.swatch, { backgroundColor: preview.green900 }]} />
                <View style={[styles.swatch, { backgroundColor: preview.green700 }]} />
                <View style={[styles.swatch, { backgroundColor: preview.gold }]} />
              </View>
              <Text style={[styles.themeName, { color: preview.ink }]}>{selected ? '✓ ' : ''}{option.label}</Text>
              <Text style={[styles.themeDescription, { color: preview.muted }]}>{option.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.ink }]}>Curriculum source</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <InfoRow label="School" value={curriculum?.school ?? '—'} />
        <InfoRow label="Program" value={curriculum?.program ?? '—'} />
        <InfoRow label="File" value={curriculum?.sourceFileName ?? '—'} />
        <InfoRow label="Fingerprint" value={curriculum?.fingerprint ?? '—'} />
        <InfoRow label="Imported" value={curriculum ? new Date(curriculum.importedAt).toLocaleString() : '—'} last />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.ink }]}>Connections</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Connection label="Supabase accounts, plans & ratings" active={cloudConfigured} />
        <Connection label="Local preview fallback" active={!cloudConfigured} last />
      </View>

      <PrimaryButton
        label="Replace curriculum HTML"
        tone="light"
        onPress={() =>
          Alert.alert(
            'Replace curriculum?',
            'This clears the current plan on this account. Your SOLAR file will be imported as a new blueprint.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace', style: 'destructive', onPress: onReplaceCurriculum },
            ],
          )
        }
        style={styles.button}
      />
      <PrimaryButton label="Sign out" tone="danger" onPress={onSignOut} style={styles.button} />

      <View style={[styles.notice, { backgroundColor: theme.warningSoft }]}>
        <Text style={[styles.noticeTitle, { color: theme.warning }]}>Unofficial planning aid</Text>
        <Text style={[styles.noticeBody, { color: theme.warning }]}> 
          CpE Pathfinder does not enroll courses, verify offerings, or replace academic advice. Confirm plans in SOLAR and against current FEU Tech policies.
        </Text>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }, last && styles.lastRow]}>
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.ink }]}>{value}</Text>
    </View>
  );
}

function Connection({ label, active, last = false }: { label: string; active: boolean; last?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }, last && styles.lastRow]}>
      <Text style={[styles.infoValue, { color: theme.ink }]}>{label}</Text>
      <View style={[styles.connectionBadge, { backgroundColor: active ? theme.green100 : theme.warningSoft }]}>
        <Text style={[styles.connectionText, { color: active ? contrastText(theme.green100, '#FFFFFF', theme.green900) : theme.warning }]}>
          {active ? 'Connected' : 'Setup needed'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 110, backgroundColor: colors.canvas },
  eyebrow: { color: colors.green700, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.ink, fontSize: 27, fontWeight: '900' },
  subtitle: { marginTop: 6, color: colors.muted, lineHeight: 20, fontSize: 13 },
  profile: { marginTop: 20, flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.green900, borderRadius: 18 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.green900, fontSize: 18, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 12 },
  email: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  mode: { marginTop: 3, color: '#B9D4C7', fontSize: 11 },
  sectionTitle: { marginTop: 22, marginBottom: 9, color: colors.ink, fontSize: 17, fontWeight: '900' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChoice: { width: '48%', minHeight: 104, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  themeSelected: { borderWidth: 3 },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: { width: 22, height: 9, borderRadius: 5 },
  themeName: { marginTop: 10, fontSize: 12, fontWeight: '900' },
  themeDescription: { marginTop: 3, fontSize: 9 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  infoRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  lastRow: { borderBottomWidth: 0 },
  infoLabel: { color: colors.muted, fontSize: 11, flexShrink: 0 },
  infoValue: { color: colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  connectionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  connected: { backgroundColor: colors.green100 },
  notConnected: { backgroundColor: colors.warningSoft },
  connectionText: { fontSize: 9, fontWeight: '900' },
  connectedText: { color: colors.green800 },
  notConnectedText: { color: colors.warning },
  button: { marginTop: 12 },
  notice: { marginTop: 20, padding: 15, backgroundColor: colors.warningSoft, borderRadius: 15 },
  noticeTitle: { color: colors.warning, fontWeight: '900', fontSize: 12 },
  noticeBody: { marginTop: 5, color: colors.warning, fontSize: 11, lineHeight: 17 },
});
