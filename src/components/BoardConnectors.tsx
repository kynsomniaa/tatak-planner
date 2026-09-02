import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Marker, Path, Polygon } from 'react-native-svg';
import { contrastText } from '../theme';

export interface BoardConnectorEdge {
  key: string;
  sourceCode: string;
  targetCode: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  passed?: boolean;
  kind?: 'prerequisite' | 'corequisite';
  color?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function BoardConnectors({
  edges,
  selectedEdgeKeys,
  width,
  height,
  accent,
  muted,
}: {
  edges: BoardConnectorEdge[];
  selectedEdgeKeys: Set<string>;
  width: number;
  height: number;
  accent: string;
  muted: string;
}) {
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(flow, {
      toValue: 52,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [flow]);

  const markerId = (color: string, start = false) => `flow-arrow-${start ? 'start-' : ''}${color.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const edgeColors = [...new Set(edges.map((edge) => edge.color ?? accent))];
  return (
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]} width={width} height={height}>
      <Defs>
        {edgeColors.flatMap((color) => [
          <Marker key={markerId(color)} id={markerId(color)} markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
            <Polygon points="0,0 7,3.5 0,7" fill={color} />
          </Marker>,
          <Marker key={markerId(color, true)} id={markerId(color, true)} markerHeight="7" markerWidth="7" orient="auto" refX="1" refY="3.5">
            <Polygon points="7,0 0,3.5 7,7" fill={color} />
          </Marker>,
        ])}
      </Defs>
      {edges.map((edge) => {
        const selected = selectedEdgeKeys.has(edge.key);
        if (!selected) return null;
        const color = edge.color ?? accent;
        const outline = contrastText(color, '#FFFFFF', '#121416');
        const sameColumn = Math.abs(edge.x2 - edge.x1) < 30;
        const curve = Math.max(48, Math.abs(edge.x2 - edge.x1) * 0.42);
        const d = sameColumn
          ? `M ${edge.x1} ${edge.y1} C ${edge.x1 + 52} ${edge.y1}, ${edge.x2 + 52} ${edge.y2}, ${edge.x2} ${edge.y2}`
          : `M ${edge.x1} ${edge.y1} C ${edge.x1 + curve} ${edge.y1}, ${edge.x2 - curve} ${edge.y2}, ${edge.x2} ${edge.y2}`;
        if (selected) {
          return (
            <React.Fragment key={edge.key}>
              <Path d={d} fill="none" stroke={color} strokeLinecap="round" strokeOpacity={0.30} strokeWidth={19} />
              <Path d={d} fill="none" stroke={outline} strokeLinecap="round" strokeOpacity={0.68} strokeWidth={10} />
              <Path d={d} fill="none" stroke={color} strokeLinecap="round" strokeOpacity={0.96} strokeWidth={7} />
              <AnimatedPath
                d={d}
                fill="none"
                markerEnd={`url(#${markerId(color)})`}
                markerStart={edge.kind === 'corequisite' ? `url(#${markerId(color, true)})` : undefined}
                stroke={color}
                strokeDasharray="2 11"
                strokeDashoffset={Animated.multiply(flow, -1)}
                strokeLinecap="round"
                strokeWidth={4.8}
              />
              <Circle cx={edge.x2} cy={edge.y2} r={7} fill={outline} />
              <Circle cx={edge.x2} cy={edge.y2} r={5} fill={color} />
            </React.Fragment>
          );
        }
        return null;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 40, elevation: 40 },
});
