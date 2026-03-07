// src/components/sidebar/ThemePopover.tsx
import { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { styled, keyframes, themeObjects } from "../../stitches.config";
import * as Icons from "@radix-ui/react-icons";

// =======================
// Animations
// =======================
const slideRightAndFade = keyframes({
  "0%": { opacity: 0, transform: "translateX(-6px)" },
  "100%": { opacity: 1, transform: "translateX(0)" },
});

// =======================
// Styled Components
// =======================
const PopoverContent = styled(Popover.Content, {
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: "12px",
  padding: "12px",
  minWidth: "180px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
  animation: `${slideRightAndFade} 0.25s ease-out`,
});

const PopoverArrow = styled(Popover.Arrow, {
  fill: "$currentLine",
});

const ScrollArea = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "calc(4 * 48px + 16px)", // 4 buttons + padding
  overflowY: "auto",
  paddingRight: "4px", // prevent scrollbar overlapping
});

export const ThemeButton = styled("button", {
  all: "unset",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 14px",
  borderRadius: "9999px",
  cursor: "pointer",
  fontSize: "0.95rem",
  fontWeight: 500,
  backgroundColor: "$currentLine",
  transition: "all 0.2s ease",
  "&:hover": {
    backgroundColor: "$purple",
    transform: "translateY(-1px)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  },
  "&:active": {
    transform: "translateY(0)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
});

const ColorSwatch = styled("span", {
  width: "18px",
  height: "18px",
  borderRadius: "50%",
  flexShrink: 0,
  border: "2px solid $foreground",
});

const TriggerButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  color: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
});

// =======================
// Component
// =======================
export function ThemePopover() {
  const themeKeys = Object.keys(themeObjects) as Array<
    keyof typeof themeObjects
  >;
  const [activeTheme, setActiveTheme] = useState<string>(themeKeys[0]);

  // Detect currently applied theme on mount
  useEffect(() => {
    const current = themeKeys.find((key) =>
      document.body.classList.contains(`${key}-theme`),
    );
    if (current) setActiveTheme(current);
  }, [themeKeys]);

  const switchTheme = (themeKey: string) => {
    const body = document.body;
    themeKeys.forEach((key) => body.classList.remove(`${key}-theme`));
    body.classList.add(`${themeKey}-theme`);
    setActiveTheme(themeKey);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <TriggerButton aria-label="Select Theme">
          <Icons.ColorWheelIcon width={20} height={20} />
        </TriggerButton>
      </Popover.Trigger>

      <PopoverContent side="right" align="start" style={{ maxHeight: "240px" }}>
        <ScrollArea>
          {themeKeys.map((key) => {
            const theme = themeObjects[key];
            const isActive = activeTheme === key;
            return (
              <ThemeButton
                key={key}
                style={{ backgroundColor: isActive ? "#6b5fb5" : undefined }}
                onClick={() => switchTheme(key)}
              >
                <ColorSwatch
                  style={{ backgroundColor: theme.colors.background }}
                />
                {theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
              </ThemeButton>
            );
          })}
        </ScrollArea>

        <PopoverArrow />
      </PopoverContent>
    </Popover.Root>
  );
}
