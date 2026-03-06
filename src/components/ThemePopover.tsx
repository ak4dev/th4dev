import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { styled, keyframes } from '../../stitches.config';
import * as Icons from '@radix-ui/react-icons';

// =======================
// Animations
// =======================
const slideRightAndFade = keyframes({
  '0%': { opacity: 0, transform: 'translateX(-6px)' },
  '100%': { opacity: 1, transform: 'translateX(0)' },
});

// =======================
// Styled Components
// =======================
const PopoverContent = styled(Popover.Content, {
  backgroundColor: '$currentLine',
  color: '$foreground',
  borderRadius: '12px',
  padding: '12px',
  minWidth: '180px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
  animation: `${slideRightAndFade} 0.25s ease-out`,
});

const PopoverArrow = styled(Popover.Arrow, {
  fill: '$currentLine',
});

const ThemeButton = styled('button', {
  all: 'unset',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 14px',
  borderRadius: '9999px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: 500,
  backgroundColor: '$currentLine',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: '$purple',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  },
});

const ColorSwatch = styled('span', {
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  flexShrink: 0,
  border: '2px solid $foreground',
});

// =======================
// Component
// =======================
export function ThemePopover() {
  const [activeTheme, setActiveTheme] = useState<'dracula' | 'gruvbox'>('dracula');

  useEffect(() => {
    if (document.body.classList.contains('gruvbox-theme')) setActiveTheme('gruvbox');
    else setActiveTheme('dracula');
  }, []);

  const switchTheme = (theme: 'dracula' | 'gruvbox') => {
    const body = document.body;
    body.classList.remove('dracula-theme', 'gruvbox-theme');
    if (theme === 'dracula') body.classList.add('dracula-theme');
    if (theme === 'gruvbox') body.classList.add('gruvbox-theme');
    setActiveTheme(theme);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          style={{
            all: 'unset',
            cursor: 'pointer',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
          }}
          aria-label="Select Theme"
        >
          <Icons.ColorWheelIcon width={20} height={20} />
        </button>
      </Popover.Trigger>

      <PopoverContent side="right" align="start">
        <ThemeButton onClick={() => switchTheme('dracula')}>
          <ColorSwatch style={{ backgroundColor: '#282a36' }} />
          Dracula
        </ThemeButton>

        <ThemeButton onClick={() => switchTheme('gruvbox')}>
          <ColorSwatch style={{ backgroundColor: '#282828' }} />
          Gruvbox Dark
        </ThemeButton>

        <PopoverArrow />
      </PopoverContent>
    </Popover.Root>
  );
}