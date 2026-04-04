/* ==================================================
 * Theme Switcher Component
 * ================================================== */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { styled, themeObjects } from "../../stitches.config";
import * as Icons from "@radix-ui/react-icons";
import {
  SCROLLABLE_THEME_ITEMS,
  THEME_ITEM_HEIGHT,
} from "../common/constants/app-constants";

/* ==================================================
 * Helpers
 * ================================================== */

/** Convert camelCase theme key to "Title Case" display name */
function formatThemeName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/* ==================================================
 * Styled Components
 * ================================================== */

const TriggerButton = styled(DropdownMenu.Trigger, {
  all: "unset",
  cursor: "pointer",
  color: "$foreground",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  marginBottom: "0.5rem",
  borderRadius: 5,
  "&:hover": {
    backgroundColor: "$purple",
  },
});

const DropdownContent = styled(DropdownMenu.Content, {
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: "12px",
  minWidth: "200px",
  padding: "8px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
});

const DropdownLabel = styled(DropdownMenu.Label, {
  fontSize: "0.7rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "$comment",
  padding: "4px 12px 8px",
  userSelect: "none",
});

const ScrollArea = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  maxHeight: `calc(${SCROLLABLE_THEME_ITEMS} * ${THEME_ITEM_HEIGHT}px + 12px)`,
  overflowY: "auto",
  paddingRight: "2px",
});

const ThemeButton = styled(DropdownMenu.Item, {
  all: "unset",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: "0.88rem",
  borderRadius: "8px",
  transition: "background 0.12s ease",
  "&:hover": {
    backgroundColor: "$comment",
    color: "$foreground",
  },
  "&:focus": {
    outline: "none",
    backgroundColor: "$comment",
  },
  variants: {
    active: {
      true: {
        backgroundColor: "$purple",
        color: "$background",
        "&:hover": {
          backgroundColor: "$purple",
          color: "$background",
        },
      },
    },
  },
});

/** Horizontal pill showing 4 theme color segments */
const SwatchPalette = styled("span", {
  display: "flex",
  borderRadius: "999px",
  overflow: "hidden",
  width: "48px",
  height: "16px",
  flexShrink: 0,
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
});

const SwatchSegment = styled("span", {
  flex: 1,
  height: "100%",
});

const ThemeName = styled("span", {
  flex: 1,
});

const CheckIcon = styled(Icons.CheckIcon, {
  flexShrink: 0,
  opacity: 0.9,
});

/* ==================================================
 * Types
 * ================================================== */

type ThemeSelectorProps = {
  activeTheme: string;
  onThemeChange: (themeName: string) => void;
};

/* ==================================================
 * Component
 * ================================================== */

export function ThemeSelector({
  activeTheme,
  onThemeChange,
}: ThemeSelectorProps) {
  const themeKeys = Object.keys(themeObjects) as Array<
    keyof typeof themeObjects
  >;

  return (
    <DropdownMenu.Root>
      <TriggerButton aria-label="Select Theme">
        <Icons.ColorWheelIcon width={20} height={20} />
      </TriggerButton>

      <DropdownMenu.Portal>
        <DropdownContent sideOffset={5}>
          <DropdownLabel>Theme</DropdownLabel>
          <ScrollArea>
            {themeKeys.map((key) => {
              const theme = themeObjects[key];
              const isActive = activeTheme === key;
              return (
                <ThemeButton
                  key={key}
                  onSelect={() => onThemeChange(key)}
                  active={isActive}
                >
                  <SwatchPalette>
                    <SwatchSegment style={{ backgroundColor: theme.colors.background }} />
                    <SwatchSegment style={{ backgroundColor: theme.colors.purple }} />
                    <SwatchSegment style={{ backgroundColor: theme.colors.cyan }} />
                    <SwatchSegment style={{ backgroundColor: theme.colors.green }} />
                  </SwatchPalette>
                  <ThemeName>{formatThemeName(key)}</ThemeName>
                  {isActive && <CheckIcon width={14} height={14} />}
                </ThemeButton>
              );
            })}
          </ScrollArea>
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
