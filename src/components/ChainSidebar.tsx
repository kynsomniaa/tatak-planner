import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { Curriculum } from '../types';
import { CourseChain, generateCourseChains } from '../domain/chains';

export function ChainSidebar({
  curriculum,
  selectedChainId,
  onSelect,
}: {
  curriculum: Curriculum;
  selectedChainId: string | null;
  onSelect: (chain: CourseChain | null) => void;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 720;
  const [mode, setMode] = useState<'open' | 'narrow' | 'hidden'>(mobile ? 'hidden' : 'open');
  const chains = useMemo(() => generateCourseChains(curriculum), [curriculum]);
  const selectedForeground = contrastText(theme.green900);
  useEffect(() => { setMode(mobile ? 'hidden' : 'open'); }, [mobile]);

  if (mode === 'hidden') {
    return (
      <Pressable onPress={() => setMode('open')} style={[styles.hiddenHandle, mobile && styles.hiddenHandleMobile, { backgroundColor: theme.green900 }]}> 
        <Text style={[styles.hiddenText, { color: contrastText(theme.green900) }]}>Chains ›</Text>
      </Pressable>
    );
  }
  if (mode === 'narrow') {
    return (
      <View style={[styles.narrow, { backgroundColor: theme.green900 }]}>
        <Pressable onPress={() => setMode('open')} style={[styles.narrowButton, { backgroundColor: theme.green800 }]}><Text style={[styles.narrowIcon, { color: contrastText(theme.green800) }]}>›</Text></Pressable>
        <Text style={[styles.narrowLabel, { color: contrastText(theme.green900) }]}>PREREQUISITE CHAINS</Text>
        <Pressable onPress={() => setMode('hidden')} style={[styles.narrowButton, { backgroundColor: theme.green800 }]}><Text style={[styles.narrowIcon, { color: contrastText(theme.green800) }]}>×</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.sidebar, mobile && styles.sidebarMobile, { backgroundColor: theme.surface, borderRightColor: theme.border, shadowColor: theme.green900 }]}> 
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.green700 }]}>COURSE MAP</Text>
          <Text style={[styles.title, { color: theme.ink }]}>Prerequisite chains</Text>
        </View>
        <Pressable onPress={() => setMode(mobile ? 'hidden' : 'narrow')} style={[styles.iconButton, { backgroundColor: theme.canvas }]}><Text style={[styles.icon, { color: theme.ink }]}>‹</Text></Pressable>
        <Pressable onPress={() => setMode('hidden')} style={[styles.iconButton, { backgroundColor: theme.canvas }]}><Text style={[styles.icon, { color: theme.ink }]}>×</Text></Pressable>
      </View>
      <Text style={[styles.help, { color: theme.muted }]}>Select a chain to reveal its flowing arrows. Select it again—or choose Show all—to hide every arrow.</Text>
      <View style={styles.legend}>
        <Legend color={theme.arrowCpe} label="CPE · strongest" />
        <Legend color={theme.arrowCoe} label="COE · strong" />
        <Legend color={theme.arrowGed} label="GED · muted" />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <Pressable
          onPress={() => { onSelect(null); if (mobile) setMode('hidden'); }}
          style={[styles.chain, { backgroundColor: theme.canvas, borderColor: theme.border }, selectedChainId === null && styles.chainSelected, selectedChainId === null && { backgroundColor: theme.green900, borderColor: theme.green900 }]}
        >
          <Text style={[styles.chainName, { color: selectedChainId === null ? selectedForeground : theme.ink }]}>Show all courses</Text>
        </Pressable>
        {chains.map((chain) => {
          const selected = selectedChainId === chain.id;
          const priority = chain.kind !== 'prerequisite';
          return (
          <Pressable
            key={chain.id}
            onPress={() => { onSelect(selected ? null : chain); if (mobile) setMode('hidden'); }}
            style={[
              styles.chain,
              { backgroundColor: priority ? theme.warningSoft : theme.canvas, borderColor: priority ? theme.gold : theme.border },
              priority && styles.priorityChain,
              selected && { backgroundColor: theme.green900, borderColor: theme.green900 },
            ]}
          >
            {priority && <Text style={[styles.priorityLabel, { color: selected ? theme.gold : theme.warning }]}>PRIORITY PATHWAY</Text>}
            <View style={styles.chainTop}>
              <Text style={[styles.chainName, { color: selected ? selectedForeground : theme.ink }]}>{chain.name}</Text>
              <Text style={[styles.count, { color: theme.gold }]}>{chain.edges.length} links</Text>
            </View>
            <Text numberOfLines={3} style={[styles.description, { color: selected ? selectedForeground : theme.muted }]}>{chain.description}</Text>
          </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const theme = useAppTheme();
  return <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: theme.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 270, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  sidebarMobile: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '86%', maxWidth: 330, zIndex: 50, shadowOpacity: 0.24, shadowRadius: 18, elevation: 16 },
  header: { padding: 15, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.green700, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  title: { marginTop: 3, color: colors.ink, fontSize: 17, fontWeight: '900' },
  iconButton: { width: 28, height: 28, marginLeft: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  icon: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  help: { paddingHorizontal: 15, paddingBottom: 10, color: colors.muted, fontSize: 10, lineHeight: 15 },
  legend: { paddingHorizontal: 15, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 16, height: 4, borderRadius: 2 },
  legendText: { fontSize: 7, fontWeight: '800' },
  list: { padding: 10, paddingBottom: 30 },
  chain: { marginBottom: 7, padding: 11, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  priorityChain: { borderLeftWidth: 5, paddingLeft: 10 },
  priorityLabel: { marginBottom: 5, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  chainSelected: { backgroundColor: colors.green900, borderColor: colors.green900 },
  chainTop: { flexDirection: 'row', alignItems: 'center' },
  chainName: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '900' },
  chainNameSelected: { color: '#FFFFFF' },
  count: { marginLeft: 6, color: colors.gold, fontSize: 9, fontWeight: '900' },
  description: { marginTop: 5, color: colors.muted, fontSize: 9, lineHeight: 13 },
  narrow: { width: 46, backgroundColor: colors.green900, alignItems: 'center', paddingVertical: 8 },
  narrowButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#285A48' },
  narrowIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  narrowLabel: { flex: 1, color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 1, writingDirection: 'ltr', transform: [{ rotate: '-90deg' }], width: 180, textAlign: 'center' },
  hiddenHandle: { width: 28, backgroundColor: colors.green900, alignItems: 'center', justifyContent: 'center' },
  hiddenHandleMobile: { position: 'absolute', left: 0, top: 10, width: 34, height: 78, zIndex: 40, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  hiddenText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', transform: [{ rotate: '-90deg' }], width: 90, textAlign: 'center' },
});
