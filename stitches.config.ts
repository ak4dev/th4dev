// stitches.config.ts
import { createStitches } from '@stitches/react';
import { slate, violet, mauve, red, green, cyan, pink, yellow, purple, blue } from '@radix-ui/colors';

export const { styled, css, globalCss, theme } = createStitches({
  theme: {
    colors: {
      // Dracula theme mapping using Radix tokens
      background: '#282a36',      // main background
      currentLine: '#44475a',     // sidebar bg
      foreground: '#f8f8f2',      // main text
      comment: '#6272a4',         // muted text
      cyan: cyan.cyan9,
      green: green.green9,
      orange: yellow.yellow9,
      pink: pink.pink9,
      purple: purple.purple9,
      red: red.red9,
      yellow: yellow.yellow9,
    },
    fonts: {
      body: 'Fira Code, monospace',
    },
  },
});