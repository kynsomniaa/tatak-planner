import React, { ReactNode, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { ThemePalette } from './types';

export interface AppColors {
  green900: string;
  green800: string;
  green700: string;
  green100: string;
  gold: string;
  ink: string;
  muted: string;
  surface: string;
  canvas: string;
  border: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  blue: string;
  arrowGed: string;
  arrowCoe: string;
  arrowCpe: string;
}

export const palettes: Record<Exclude<ThemePalette, 'system'>, AppColors> = {
  'feu-green': {
    green900: '#063D2C', green800: '#07563B', green700: '#087A4C', green100: '#DDF4E7',
    gold: '#F2B94B', ink: '#18201D', muted: '#66736D', surface: '#FFFFFF', canvas: '#F3F6F4',
    border: '#DCE4DF', warning: '#A85D00', warningSoft: '#FFF0D5', danger: '#B42318',
    dangerSoft: '#FEE4E2', blue: '#2366C4',
    arrowGed: '#6E8F82', arrowCoe: '#E99A16', arrowCpe: '#00A85A',
  },
  dark: {
    green900: '#111518', green800: '#303A3F', green700: '#74B995', green100: '#23352D',
    gold: '#E6B955', ink: '#F2F5F3', muted: '#AAB5AF', surface: '#1B2023', canvas: '#0E1113',
    border: '#343C40', warning: '#F2AF54', warningSoft: '#3A2A16', danger: '#F08B82',
    dangerSoft: '#3B2020', blue: '#78A9EF',
    arrowGed: '#83918B', arrowCoe: '#FFD05A', arrowCpe: '#72F0AE',
  },
  'black-maroon': {
    green900: '#090708', green800: '#6C1830', green700: '#A93454', green100: '#3A1521',
    gold: '#D5AA56', ink: '#FAF4F6', muted: '#B9AAB0', surface: '#191214', canvas: '#080607',
    border: '#3B2830', warning: '#E9A44B', warningSoft: '#382413', danger: '#F07C78',
    dangerSoft: '#3A191C', blue: '#8AAEF2',
    arrowGed: '#947580', arrowCoe: '#F5A33A', arrowCpe: '#FF477E',
  },
  'black-orange': {
    green900: '#080706', green800: '#9C3D0B', green700: '#E06A21', green100: '#3C2112',
    gold: '#FF9E3D', ink: '#FFF7F0', muted: '#C3B2A6', surface: '#1B1511', canvas: '#090705',
    border: '#403027', warning: '#FFAD52', warningSoft: '#3D2713', danger: '#FF8077',
    dangerSoft: '#3E1C19', blue: '#86B5F8',
    arrowGed: '#947E70', arrowCoe: '#FFC247', arrowCpe: '#FF4D00',
  },
  'pastel-pink': {
    green900: '#74334F', green800: '#954463', green700: '#B9577D', green100: '#F9DCE9',
    gold: '#D7A7EA', ink: '#3C2530', muted: '#7B6570', surface: '#FFF9FC', canvas: '#FFF0F6',
    border: '#EAC9D8', warning: '#995A12', warningSoft: '#FFE8CF', danger: '#B83E5D',
    dangerSoft: '#FFDCE5', blue: '#6A75C9',
    arrowGed: '#A57D91', arrowCoe: '#7567E8', arrowCpe: '#F02C80',
  },
};

export const colors = palettes['feu-green'];

const ThemeContext = React.createContext<AppColors>(colors);

export function ThemeProvider({ palette, children }: { palette: ThemePalette; children: ReactNode }) {
  const scheme = useColorScheme();
  const resolved = palette === 'system' ? (scheme === 'dark' ? palettes.dark : palettes['feu-green']) : palettes[palette];
  return React.createElement(ThemeContext.Provider, { value: resolved }, children);
}

export const useAppTheme = () => useContext(ThemeContext);

const channel = (hex: string, offset: number) =>
  Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;

/** Returns a readable foreground for any solid theme background. */
export function contrastText(background: string, light = '#FFFFFF', dark = '#111713'): string {
  const hex = background.trim();
  if (!/^#[0-9A-F]{6}$/i.test(hex)) return light;
  const linear = [channel(hex, 1), channel(hex, 3), channel(hex, 5)].map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.43 ? dark : light;
}
