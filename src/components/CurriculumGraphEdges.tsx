import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, Marker, Path, Polygon } from 'react-native-svg';
import { CurriculumGraphLayout, CurriculumGraphPoint } from '../domain/curriculumGraph';
import { courseDepartment } from '../domain/coursePresentation';
import { contrastText, useAppTheme } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function distance(left: CurriculumGraphPoint, right: CurriculumGraphPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointToward(from: CurriculumGraphPoint, to: CurriculumGraphPoint, amount: number) {
  const length = Math.max(0.001, distance(from, to));
  const ratio = Math.min(0.5, amount / length);
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

/** Turns routed orthogonal points into a branch-like path with rounded elbows. */
function roundedPath(points: CurriculumGraphPoint[], radius = 17) {
  if (points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    if (index === points.length - 1) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }
    const previous = points[index - 1];
    const next = points[index + 1];
    const before = pointToward(current, previous, Math.min(radius, distance(previous, current) / 2));
    const after = pointToward(current, next, Math.min(radius, distance(current, next) / 2));
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  return path;
}

export function CurriculumGraphEdges({ layout, highlightedEdgeKeys, showEveryArrow }: {
  layout: CurriculumGraphLayout;
  highlightedEdgeKeys: Set<string>;
  showEveryArrow: boolean;
}) {
  const theme = useAppTheme();
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(flow, { toValue: 52, duration: 920, easing: Easing.linear, useNativeDriver: false }));
    animation.start();
    return () => animation.stop();
  }, [flow]);
  const colorFor = (code: string) => courseDepartment(code) === 'CPE' ? theme.arrowCpe : courseDepartment(code) === 'COE' ? theme.arrowCoe : theme.arrowGed;
  const markerId = (color: string) => `map-arrow-${color.replace(/[^a-z0-9]/gi, '')}`;
  const colors = [...new Set([theme.arrowGed, theme.arrowCoe, theme.arrowCpe])];
  const inspecting = highlightedEdgeKeys.size > 0;
  return (
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edges]} width={layout.width} height={layout.height}>
      <Defs>
        {colors.map((color) => <Marker key={color} id={markerId(color)} markerHeight="11" markerUnits="userSpaceOnUse" markerWidth="11" orient="auto" refX="10" refY="5.5"><Polygon points="0,0 11,5.5 0,11" fill={color} /></Marker>)}
      </Defs>
      {layout.edges.map((edge) => {
        const color = colorFor(edge.sourceCode);
        const highlighted = highlightedEdgeKeys.has(edge.key);
        const d = roundedPath(edge.points ?? []);
        if (!d) return null;
        const prominence = edge.prominence ?? 0;
        const branch = edge.branchKind ?? 'normal';
        const branchOpacity = branch === 'thesis' ? 0.82 : branch === 'core' ? 0.58 : branch === 'normal' ? 0.28 : 0.1;
        const branchWidth = branch === 'thesis' ? 6.8 : branch === 'core' ? 4.4 : branch === 'normal' ? 2.3 : 1.15;
        const baseOpacity = highlighted ? 0 : inspecting ? 0.028 : showEveryArrow ? Math.max(0.62, branchOpacity) : branchOpacity;
        const marker = edge.kind === 'prerequisite' ? `url(#${markerId(color)})` : undefined;
        const width = branchWidth + prominence * 0.8;
        return (
          <React.Fragment key={edge.key}>
            {!highlighted && !inspecting && (branch === 'core' || branch === 'thesis') && <Path d={d} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={branch === 'thesis' ? 0.13 : 0.07} strokeWidth={width + (branch === 'thesis' ? 12 : 7)} />}
            {baseOpacity > 0 && <Path d={d} fill="none" markerEnd={marker} stroke={color} strokeDasharray={edge.kind === 'corequisite' ? '8 6' : undefined} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={baseOpacity} strokeWidth={showEveryArrow ? width + 0.7 : width} />}
            {!highlighted && !inspecting && branch === 'thesis' && <AnimatedPath d={d} fill="none" stroke={contrastText(color, '#FFFFFF', '#101413')} strokeDasharray="3 18" strokeDashoffset={Animated.multiply(flow, -1)} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.7} strokeWidth={2.2} />}
            {highlighted && <>
              <Path d={d} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.24} strokeWidth={18 + prominence * 6} />
              <Path d={d} fill="none" stroke={contrastText(color, '#FFFFFF', '#101413')} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.54} strokeWidth={8 + prominence * 2} />
              <AnimatedPath d={d} fill="none" markerEnd={marker} stroke={color} strokeDasharray="4 11" strokeDashoffset={Animated.multiply(flow, -1)} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5 + prominence * 1.8} />
            </>}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({ edges: { zIndex: 3, elevation: 3 } });
