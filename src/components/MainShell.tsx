import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, useAppTheme } from '../theme';
import { AppSession, CourseRating, StudentWorkspace } from '../types';
import { ProgressScreen } from './ProgressScreen';
import { SettingsScreen } from './SettingsScreen';
import { RatingsScreen } from './RatingsScreen';
import { loadRatings } from '../services/ratings';
import { CurriculumRaidScreen } from './CurriculumRaidScreen';
import { GuidedTour, TourStep } from './GuidedTour';
import { completeTutorial, shouldResumeTutorial } from '../domain/tutorial';

type Tab = 'map' | 'progress' | 'ratings' | 'settings';
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'map', label: 'Curriculum Map', icon: '⌘' },
  { id: 'progress', label: 'Progress', icon: '✓' },
  { id: 'ratings', label: 'Ratings', icon: '★' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function MainShell({
  session,
  workspace,
  onChange,
  launchTutorial = false,
  onReplaceCurriculum,
  onSignOut,
}: {
  session: AppSession;
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
  launchTutorial?: boolean;
  onReplaceCurriculum: () => void;
  onSignOut: () => void;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('map');
  const [ratings, setRatings] = useState<CourseRating[]>([]);
  const [tourOpen, setTourOpen] = useState(launchTutorial);
  const [tourStep, setTourStep] = useState<TourStep | null>(null);
  useEffect(() => {
    void loadRatings(session).then(setRatings).catch(() => setRatings([]));
  }, [session.id, tab]);
  useEffect(() => {
    if (launchTutorial) {
      setTourOpen(true);
      return;
    }
    void shouldResumeTutorial(session.id).then((pending) => {
      if (pending) setTourOpen(true);
    });
  }, [session.id, launchTutorial]);
  const changeTourStep = (step: TourStep) => {
    setTourStep(step);
    setTab(step.section);
  };
  const closeTour = () => {
    setTourOpen(false);
    setTourStep(null);
    void completeTutorial(session.id);
  };
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}>
      <View style={styles.content}>
        {tab === 'map' ? <CurriculumRaidScreen workspace={workspace} onChange={onChange} ratings={ratings} tourStage={tourOpen ? tourStep?.id : undefined} />
          : tab === 'ratings' ? <RatingsScreen session={session} workspace={workspace} />
          : tab === 'progress' ? <ProgressScreen workspace={workspace} onChange={onChange} />
            : tab === 'settings' ? (
          <SettingsScreen
            session={session}
            workspace={workspace}
            onChange={onChange}
            onReplaceCurriculum={onReplaceCurriculum}
            onSignOut={onSignOut}
            onReplayTutorial={() => setTourOpen(true)}
          />
              ) : null}
      </View>
      <View style={[styles.nav, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.green900 }]}>
        {width >= 720 && <View style={styles.wordmark}><Text style={[styles.wordmarkText, { color: theme.green800 }]}>TAM // CORE</Text></View>}
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={styles.navItem}>
              <Text style={[styles.navIcon, { color: theme.muted }, active && styles.navIconActive, active && { color: theme.green700 }]}>{item.icon}</Text>
              <Text style={[styles.navLabel, { color: theme.muted }, active && styles.navLabelActive, active && { color: theme.green800 }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <GuidedTour visible={tourOpen} onStepChange={changeTourStep} onClose={closeTour} />
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
  wordmark: { width: 120, paddingLeft: 14, justifyContent: 'center' },
  wordmarkText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { color: '#89938E', fontSize: 19, fontWeight: '900' },
  navIconActive: { color: colors.green700 },
  navLabel: { marginTop: 3, color: '#89938E', fontSize: 9, fontWeight: '800' },
  navLabelActive: { color: colors.green800 },
});
