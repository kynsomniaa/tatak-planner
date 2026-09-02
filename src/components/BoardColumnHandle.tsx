import React, { ReactNode, useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderHandlers, PanResponder, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BoardColumnPosition } from '../types';
import { contrastText, useAppTheme } from '../theme';

/** A freely movable term column. Only the explicit grip starts the move gesture. */
export function MovableBoardColumn({ termId, position, locked, onMove, style, children }: {
  termId: string;
  position: BoardColumnPosition;
  locked: boolean;
  onMove: (termId: string, candidate: BoardColumnPosition) => void;
  style?: StyleProp<ViewStyle>;
  children: (handle: ReactNode, moving: boolean) => ReactNode;
}) {
  const theme = useAppTheme();
  const translation = useRef(new Animated.ValueXY()).current;
  const lastDelta = useRef({ x: 0, y: 0 });
  const latestPosition = useRef(position);
  const [moving, setMoving] = useState(false);
  latestPosition.current = position;

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !locked,
    onMoveShouldSetPanResponder: (_event, gesture) => !locked && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      lastDelta.current = { x: 0, y: 0 };
      translation.setValue({ x: 0, y: 0 });
      setMoving(true);
    },
    onPanResponderMove: (_event, gesture) => {
      lastDelta.current = { x: gesture.dx, y: gesture.dy };
      translation.setValue(lastDelta.current);
    },
    onPanResponderRelease: () => {
      const origin = latestPosition.current;
      onMove(termId, { x: origin.x + lastDelta.current.x, y: origin.y + lastDelta.current.y });
      translation.setValue({ x: 0, y: 0 });
      setMoving(false);
    },
    onPanResponderTerminate: () => {
      translation.setValue({ x: 0, y: 0 });
      setMoving(false);
    },
  }), [locked, onMove, termId, translation]);

  const handle = <BoardColumnHandle locked={locked} moving={moving} panHandlers={responder.panHandlers} />;

  return (
    <Animated.View
      style={[
        styles.movable,
        style,
        { left: position.x, top: position.y, transform: translation.getTranslateTransform() },
        moving && { zIndex: 60, elevation: 60, shadowColor: theme.green700, shadowOpacity: 0.4, shadowRadius: 16 },
      ]}
    >
      {children(handle, moving)}
    </Animated.View>
  );
}

export function BoardColumnHandle({ locked, moving, panHandlers }: {
  locked: boolean;
  moving: boolean;
  panHandlers: GestureResponderHandlers;
}) {
  const theme = useAppTheme();
  const background = moving ? theme.gold : theme.surface;
  return (
    <View
      accessibilityLabel={locked ? 'Column positions are locked' : 'Drag to move this term anywhere on the board'}
      {...(locked ? {} : panHandlers)}
      style={[styles.grip, { backgroundColor: background, borderColor: moving ? theme.gold : theme.border }, locked && styles.locked]}
    >
      <Text style={[styles.gripIcon, { color: contrastText(background, '#FFFFFF', theme.green900) }]}>{locked ? '🔒' : '⠿'}</Text>
      <Text style={[styles.gripText, { color: contrastText(background, '#FFFFFF', theme.green900) }]}>{moving ? 'MOVING' : 'MOVE'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  movable: { position: 'absolute' },
  grip: { width: 38, height: 43, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gripIcon: { fontSize: 15, lineHeight: 16, fontWeight: '900' },
  gripText: { marginTop: 2, fontSize: 5.5, fontWeight: '900', letterSpacing: 0.4 },
  locked: { opacity: 0.66 },
});
