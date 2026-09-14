import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { starFillFractions } from '../domain/ratingPresentation';
import { useAppTheme } from '../theme';

export type StarRatingSize = 'xs' | 'sm' | 'md' | number;

const STAR_POINTS = '12,1.5 15.1,8 22.2,8.9 17,13.9 18.3,21 12,17.5 5.7,21 7,13.9 1.8,8.9 8.9,8';

const pixelSize = (size: StarRatingSize) => typeof size === 'number' ? size : size === 'xs' ? 11 : size === 'md' ? 19 : 15;

function StarIcon({ fraction, size, activeColor, emptyColor }: {
  fraction: number;
  size: number;
  activeColor: string;
  emptyColor: string;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Polygon points={STAR_POINTS} fill={emptyColor} stroke={emptyColor} strokeWidth={1.2} strokeLinejoin="round" />
      </Svg>
      {fraction > 0 && (
        <View pointerEvents="none" style={[styles.starFill, { width: `${Math.round(fraction * 100)}%` as `${number}%` }]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Polygon points={STAR_POINTS} fill={activeColor} stroke={activeColor} strokeWidth={1.2} strokeLinejoin="round" />
          </Svg>
        </View>
      )}
    </View>
  );
}

/** Reusable SVG star visualization for exact or aggregate 1–5 ratings. */
export function StarRating({
  value,
  max = 5,
  size = 'sm',
  showValue = true,
  label = 'Rating',
  activeColor,
  emptyColor,
  valueColor,
}: {
  value: number;
  max?: number;
  size?: StarRatingSize;
  showValue?: boolean;
  label?: string;
  activeColor?: string;
  emptyColor?: string;
  valueColor?: string;
}) {
  const theme = useAppTheme();
  const starSize = pixelSize(size);
  const normalized = Math.max(0, Math.min(max, value));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${normalized.toFixed(1)} out of ${max}`}
      style={styles.row}
    >
      <View style={styles.stars}>
        {starFillFractions(normalized, max).map((fraction, index) => (
          <StarIcon
            key={index}
            fraction={fraction}
            size={starSize}
            activeColor={activeColor ?? theme.gold}
            emptyColor={emptyColor ?? theme.border}
          />
        ))}
      </View>
      {showValue && <Text style={[styles.value, { color: valueColor ?? theme.muted, fontSize: Math.max(8, starSize * 0.68) }]}>{normalized.toFixed(1)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  starFill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  value: { fontWeight: '900', lineHeight: 14 },
});
