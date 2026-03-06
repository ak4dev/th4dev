// stitches.config.ts
import { createStitches } from '@stitches/react';

export const dracula = {
  background: '#282a36',
  currentLine: '#44475a',
  foreground: '#f8f8f2',
  comment: '#6272a4',
  cyan: '#8be9fd',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
  purple: '#bd93f9',
  red: '#ff5555',
  yellow: '#f1fa8c',
};

export const gruvbox = {
  background: '#282828',
  currentLine: '#3c3836',
  foreground: '#ebdbb2',
  comment: '#928374',
  cyan: '#8ec07c',
  green: '#b8bb26',
  orange: '#fe8019',
  pink: '#d3869b',
  purple: '#b16286',
  red: '#fb4934',
  yellow: '#fabd2f',
};

// ✅ Export keyframes for animations
export const { styled, css, globalCss, createTheme, keyframes } = createStitches({
  theme: {
    colors: dracula,
    fonts: { body: 'Fira Code, monospace' },
  },
});

// Create Stitches theme classes
export const draculaTheme = createTheme('dracula-theme', { colors: dracula });
export const gruvboxTheme = createTheme('gruvbox-theme', { colors: gruvbox });

// Global styles
export const globalStyles = globalCss({
  '*': { boxSizing: 'border-box', margin: 0, padding: 0 },
  body: {
    fontFamily: '$body',
    backgroundColor: '$background',
    color: '$foreground',
    transition: 'all 0.25s ease',
  },
});