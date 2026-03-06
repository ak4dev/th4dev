// src/components/ThemeSelector.tsx
import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { styled } from '../../stitches.config';
import * as Icons from '@radix-ui/react-icons';

// =======================
// Styled Components
// =======================
const PopoverContent = styled(Popover.Content, {
  backgroundColor: '$currentLine',
  color: '$foreground',
  borderRadius: '12px',
  padding: '12px',
  minWidth: '160px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
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
  border: '1px solid $foreground',
  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
});

const SidebarButton = styled('button', {
  all: 'unset',
  color: '$foreground',
  padding: '0.75rem',
  marginBottom: '0.5rem',
  cursor: 'pointer',
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    backgroundColor: '$purple',
  },
});

// =======================
// Component
// =======================
type ThemeSelectorProps = {
  onThemeChange: (theme: 'dracula' | 'gruvbox') => void;
};

export function ThemeSelector({ onThemeChange }: ThemeSelectorProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <SidebarButton>
          <Icons.ColorWheelIcon />
        </SidebarButton>
      </Popover.Trigger>

      <PopoverContent side="right" align="start">
        <ThemeButton onClick={() => onThemeChange('dracula')}>
          <ColorSwatch style={{ backgroundColor: '#282a36' }} />
          Dracula
        </ThemeButton>
        <ThemeButton onClick={() => onThemeChange('gruvbox')}>
          <ColorSwatch style={{ backgroundColor: '#282828' }} />
          Gruvbox Dark
        </ThemeButton>
      </PopoverContent>
    </Popover.Root>
  );
}