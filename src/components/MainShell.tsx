import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, useAppTheme } from '../theme';
import { AppSession, CourseRating, StudentWorkspace } from '../types';
import { PlannerScreen } from './PlannerScreen';
import { ProgressScreen } from './ProgressScreen';
import { SettingsScreen } from './SettingsScreen';
import { BlueprintScreen } from './BlueprintScreen';
import { RatingsScreen } from './RatingsScreen';
import { loadRatings } from '../services/ratings';

type Tab = 'blueprint' | 'plan' | 'ratings' | 'progress' | 'settings';
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'blueprint', label: 'Curriculum', icon: '▤' },
  { id: 'plan', label: 'Plan', icon: '▦' },
  { id: 'ratings', label: 'Ratings', icon: '★' },
  { id: 'progress', label: 'Progress', icon: '✓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function MainShell({
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
  const [tab, setTab] = useState<Tab>('plan');
  const [boardFullScreen, setBoardFullScreen] = useState(false);
  const [ratings, setRatings] = useState<CourseRating[]>([]);
  useEffect(() => {
    void loadRatings(session).then(setRatings).catch(() => setRatings([]));
  }, [session.id, tab]);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}>
      <View style={styles.content}>
        {tab === 'blueprint' ? (
          <BlueprintScreen
            workspace={workspace}
            onChange={onChange}
            ratings={ratings}
            onOpenPlanner={() => setTab('plan')}
          />
        ) : tab === 'plan' ? (
          <PlannerScreen
            workspace={workspace}
            onChange={onChange}
            ratings={ratings}
            fullScreen={boardFullScreen}
            onFullScreenChange={setBoardFullScreen}
          />
        ) : tab === 'ratings' ? <RatingsScreen session={session} workspace={workspace} />
          : tab === 'progress' ? <ProgressScreen workspace={workspace} onChange={onChange} />
            : tab === 'settings' ? (
          <SettingsScreen
            session={session}
            workspace={workspace}
            onChange={onChange}
            onReplaceCurriculum={onReplaceCurriculum}
            onSignOut={onSignOut}
          />
              ) : null}
      </View>
      {!(tab === 'plan' && boardFullScreen) && <View style={[styles.nav, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.green900 }]}> 
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={styles.navItem}>
              <Text style={[styles.navIcon, { color: theme.muted }, active && styles.navIconActive, active && { color: theme.green700 }]}>{item.icon}</Text>
              <Text style={[styles.navLabel, { color: theme.muted }, active && styles.navLabelActive, active && { color: theme.green800 }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  nav: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    shadowColor: '#0A2C1D',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { color: '#89938E', fontSize: 19, fontWeight: '900' },
  navIconActive: { color: colors.green700 },
  navLabel: { marginTop: 3, color: '#89938E', fontSize: 9, fontWeight: '800' },
  navLabelActive: { color: colors.green800 },
});
