// src/components/sidebar/ThemeSelector.tsx
import React, { useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { styled, themeObjects } from '../../stitches.config';
import * as Icons from '@radix-ui/react-icons';

// =======================
// Styled Components
// =======================
const TriggerButton = styled(DropdownMenu.Trigger, {
  all: 'unset',
  cursor: 'pointer',
  color: '$foreground',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  marginBottom: '0.5rem',
  borderRadius: 5,
  '&:hover': {
    backgroundColor: '$purple',
  },
});

const DropdownContent = styled(DropdownMenu.Content, {
  backgroundColor: '$currentLine',
  color: '$foreground',
  borderRadius: '12px',
  minWidth: '180px',
  padding: '8px',
  boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
});

const ScrollArea = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  maxHeight: 'calc(4 * 44px + 12px)', // ~4 items visible, then scroll
  overflowY: 'auto',
  paddingRight: '4px',
});

const ThemeButton = styled(DropdownMenu.Item, {
  all: 'unset',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  borderRadius: '9999px',
  backgroundColor: '$currentLine',
  '&:hover': {
    backgroundColor: '$purple',
    color: '$background',
  },
  '&:focus': {
    outline: 'none',
    backgroundColor: '$comment',
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

// =======================
// Component
// =======================
type ThemeSelectorProps = {
  onThemeChange: (themeName: string) => void;
};

export function ThemeSelector({ onThemeChange }: ThemeSelectorProps) {
  const themeKeys = Object.keys(themeObjects) as Array<keyof typeof themeObjects>;
  const [activeTheme, setActiveTheme] = useState<string>(themeKeys[0]);

  // Detect current body theme on mount
  useEffect(() => {
    const current = themeKeys.find(key =>
      document.body.classList.contains(`${key}-theme`)
    );
    if (current) setActiveTheme(current);
  }, [themeKeys]);

  const switchTheme = (themeKey: string) => {
    const body = document.body;
    themeKeys.forEach(key => body.classList.remove(`${key}-theme`));
    body.classList.add(`${themeKey}-theme`);
    setActiveTheme(themeKey);
    onThemeChange(themeKey);
  };

  return (
    <DropdownMenu.Root>
      <TriggerButton aria-label="Select Theme">
        <Icons.ColorWheelIcon width={20} height={20} />
      </TriggerButton>

      <DropdownMenu.Portal>
        <DropdownContent sideOffset={5}>
          <ScrollArea>
            {themeKeys.map(key => {
              const theme = themeObjects[key];
              const isActive = activeTheme === key;
              return (
                <ThemeButton
                  key={key}
                  onSelect={() => switchTheme(key)}
                  style={{
                    backgroundColor: isActive ? '$purple' : undefined,
                    color: isActive ? '$background' : undefined,
                  }}
                >
                  <ColorSwatch style={{ backgroundColor: theme.colors.background }} />
                  {theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
                </ThemeButton>
              );
            })}
          </ScrollArea>
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}