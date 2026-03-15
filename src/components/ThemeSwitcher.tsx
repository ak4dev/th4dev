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
  minWidth: "180px",
  padding: "8px",
  boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
});

const ScrollArea = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  maxHeight: `calc(${SCROLLABLE_THEME_ITEMS} * ${THEME_ITEM_HEIGHT}px + 12px)`,
  overflowY: "auto",
  paddingRight: "4px",
});

const ThemeButton = styled(DropdownMenu.Item, {
  all: "unset",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  cursor: "pointer",
  fontSize: "0.95rem",
  borderRadius: "9999px",
  backgroundColor: "$currentLine",
  "&:hover": {
    backgroundColor: "$purple",
    color: "$background",
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
      },
    },
  },
});

const ColorSwatch = styled("span", {
  width: "18px",
  height: "18px",
  borderRadius: "50%",
  flexShrink: 0,
  border: "1px solid $foreground",
  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
});

/* ==================================================
 * Types
 * ================================================== */

/**
 * Props for the ThemeSelector component
 */
type ThemeSelectorProps = {
  /** The currently active theme key */
  activeTheme: string;
  /** Callback function invoked when theme changes */
  onThemeChange: (themeName: string) => void;
};

/* ==================================================
 * Component
 * ================================================== */

/**
 * Theme selector dropdown component
 * Allows users to switch between available color themes
 */
export function ThemeSelector({
  activeTheme,
  onThemeChange,
}: ThemeSelectorProps) {
  const themeKeys = Object.keys(themeObjects) as Array<
    keyof typeof themeObjects
  >;

  /**
   * Switch to a new theme
   * @param themeKey - The key of the theme to switch to
   */
  const switchTheme = (themeKey: string) => {
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
            {themeKeys.map((key) => {
              const theme = themeObjects[key];
              const isActive = activeTheme === key;
              return (
                <ThemeButton
                  key={key}
                  onSelect={() => switchTheme(key)}
                  active={isActive}
                >
                  <ColorSwatch
                    style={{ backgroundColor: theme.colors.background }}
                  />
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
