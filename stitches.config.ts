// src/stitches.config.ts
import { createStitches } from '@stitches/react';

/* ------------------------------------------------ */
/* Theme Definitions */
/* ------------------------------------------------ */
export const themeObjects = {
  dracula: {
    name: 'dracula',
    colors: {
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
    },
  },
  gruvbox: {
    name: 'gruvbox',
    colors: {
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
    },
  },
  nord: {
    name: 'nord',
    colors: {
      background: '#2e3440',
      currentLine: '#3b4252',
      foreground: '#d8dee9',
      comment: '#4c566a',
      cyan: '#88c0d0',
      green: '#a3be8c',
      orange: '#d08770',
      pink: '#b48ead',
      purple: '#5e81ac',
      red: '#bf616a',
      yellow: '#ebcb8b',
    },
  },
  solarizedDark: {
    name: 'solarizedDark',
    colors: {
      background: '#002b36',
      currentLine: '#073642',
      foreground: '#839496',
      comment: '#586e75',
      cyan: '#2aa198',
      green: '#859900',
      orange: '#cb4b16',
      pink: '#d33682',
      purple: '#6c71c4',
      red: '#dc322f',
      yellow: '#b58900',
    },
  },
  solarizedLight: {
    name: 'solarizedLight',
    colors: {
      background: '#fdf6e3',
      currentLine: '#eee8d5',
      foreground: '#657b83',
      comment: '#93a1a1',
      cyan: '#2aa198',
      green: '#859900',
      orange: '#cb4b16',
      pink: '#d33682',
      purple: '#6c71c4',
      red: '#dc322f',
      yellow: '#b58900',
    },
  },
  cappuccinoLight: {
    name: 'cappuccinoLight',
    colors: {
      background: '#f5f0e1',
      currentLine: '#e4dfd0',
      foreground: '#2c2c2c',
      comment: '#99968b',
      cyan: '#65b3c3',
      green: '#7fa57f',
      orange: '#d8985c',
      pink: '#c98fb5',
      purple: '#a980cc',
      red: '#d1575c',
      yellow: '#e0c25a',
    },
  },
  cappuccinoDark: {
    name: 'cappuccinoDark',
    colors: {
      background: '#2b2a27',
      currentLine: '#3b3a36',
      foreground: '#f0e6d2',
      comment: '#7d7a68',
      cyan: '#6ab0c0',
      green: '#8fa88f',
      orange: '#d6985c',
      pink: '#c98fb5',
      purple: '#ab88c8',
      red: '#d1575c',
      yellow: '#e0c25a',
    },
  },
  oneDark: {
    name: 'oneDark',
    colors: {
      background: '#282c34',
      currentLine: '#2c313c',
      foreground: '#abb2bf',
      comment: '#5c6370',
      cyan: '#56b6c2',
      green: '#98c379',
      orange: '#d19a66',
      pink: '#c678dd',
      purple: '#a9a1e1',
      red: '#e06c75',
      yellow: '#e5c07b',
    },
  },
  oneLight: {
    name: 'oneLight',
    colors: {
      background: '#fafafa',
      currentLine: '#e5e5e5',
      foreground: '#383a42',
      comment: '#a0a1a7',
      cyan: '#0184bc',
      green: '#50a14f',
      orange: '#986801',
      pink: '#a626a4',
      purple: '#4078f2',
      red: '#e45649',
      yellow: '#c18401',
    },
  },
  tomorrowNight: {
    name: 'tomorrowNight',
    colors: {
      background: '#1d1f21',
      currentLine: '#282a2e',
      foreground: '#c5c8c6',
      comment: '#969896',
      cyan: '#8abeb7',
      green: '#b5bd68',
      orange: '#de935f',
      pink: '#cc6666',
      purple: '#b294bb',
      red: '#cc6666',
      yellow: '#f0c674',
    },
  },
  molokai: {
    name: 'molokai',
    colors: {
      background: '#272822',
      currentLine: '#3e3d32',
      foreground: '#f8f8f2',
      comment: '#75715e',
      cyan: '#66d9ef',
      green: '#a6e22e',
      orange: '#fd971f',
      pink: '#f92672',
      purple: '#ae81ff',
      red: '#f92672',
      yellow: '#e6db74',
    },
  },
  tokyoNight: {
    name: 'tokyoNight',
    colors: {
      background: '#1a1b26',
      currentLine: '#16161e',
      foreground: '#c0caf5',
      comment: '#565f89',
      cyan: '#7dcfff',
      green: '#9ece6a',
      orange: '#ff9e64',
      pink: '#bb9af7',
      purple: '#7aa2f7',
      red: '#f7768e',
      yellow: '#e0af68',
    },
  },
  tokyoNightStorm: {
    name: 'tokyoNightStorm',
    colors: {
      background: '#1f2335',
      currentLine: '#16161e',
      foreground: '#c0caf5',
      comment: '#565f89',
      cyan: '#7dcfff',
      green: '#9ece6a',
      orange: '#ff9e64',
      pink: '#bb9af7',
      purple: '#7aa2f7',
      red: '#f7768e',
      yellow: '#e0af68',
    },
  },
  tokyoNightDay: {
    name: 'tokyoNightDay',
    colors: {
      background: '#ffffff',
      currentLine: '#e5e9f0',
      foreground: '#3b4261',
      comment: '#a0a8c7',
      cyan: '#0db9d7',
      green: '#40a02b',
      orange: '#ff7e20',
      pink: '#f38ba8',
      purple: '#8839ef',
      red: '#d20f39',
      yellow: '#df8e1d',
    },
  },
  // Add more themes here modularly
};

/* ------------------------------------------------ */
/* Stitches Setup */
/* ------------------------------------------------ */
export const { styled, css, globalCss, createTheme, keyframes } = createStitches({
  theme: {
    colors: themeObjects.gruvbox.colors, // default
    fonts: { body: 'Fira Code, monospace' },
  },
});

/* ------------------------------------------------ */
/* Create theme classes dynamically */
/* ------------------------------------------------ */
export const themeClasses: Record<string, string> = Object.fromEntries(
  Object.entries(themeObjects).map(([key, themeObj]) => [
    key,
    createTheme(`${key}-theme`, { colors: themeObj.colors }),
  ])
);

/* ------------------------------------------------ */
/* Global Styles */
/* ------------------------------------------------ */
export const globalStyles = globalCss({
  '*': { boxSizing: 'border-box', margin: 0, padding: 0 },
  body: {
    fontFamily: '$body',
    backgroundColor: '$background',
    color: '$foreground',
    transition: 'all 0.25s ease',
  },
});