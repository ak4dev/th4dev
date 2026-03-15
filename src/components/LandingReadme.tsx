import { useState } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../stitches.config";

const Page = styled("main", {
  minHeight: "calc(100vh - 2rem)",
  display: "grid",
  placeItems: "center",
  padding: "24px 16px 32px",
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--colors-cyan) 22%, transparent), transparent 28%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--colors-purple) 18%, transparent), transparent 32%)",
});

const Window = styled("section", {
  width: "min(1120px, 100%)",
  border:
    "1px solid color-mix(in srgb, var(--colors-comment) 55%, transparent)",
  borderRadius: "18px",
  overflow: "hidden",
  backgroundColor:
    "color-mix(in srgb, var(--colors-background) 82%, black 18%)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.28)",
});

const TitleBar = styled("div", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px 16px",
  borderBottom:
    "1px solid color-mix(in srgb, var(--colors-comment) 45%, transparent)",
  backgroundColor:
    "color-mix(in srgb, var(--colors-currentLine) 88%, black 12%)",
});

const TitleMeta = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "$comment",
  fontSize: "0.82rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
});

const StatusText = styled("span", {
  color: "$cyan",
  fontSize: "0.8rem",
});

const ContentGrid = styled("div", {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
  "@media(max-width: 920px)": {
    gridTemplateColumns: "1fr",
  },
});

const CommandRail = styled("aside", {
  padding: "20px 16px",
  borderRight:
    "1px solid color-mix(in srgb, var(--colors-comment) 35%, transparent)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--colors-currentLine) 88%, black 12%), color-mix(in srgb, var(--colors-background) 96%, black 4%))",
  "@media(max-width: 920px)": {
    borderRight: 0,
    borderBottom:
      "1px solid color-mix(in srgb, var(--colors-comment) 35%, transparent)",
  },
});

const RailTitle = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "$foreground",
  fontSize: "0.82rem",
  marginBottom: "16px",
});

const TabList = styled("div", {
  border:
    "1px solid color-mix(in srgb, var(--colors-comment) 35%, transparent)",
  borderRadius: "16px",
  padding: "12px",
  display: "grid",
  gap: "8px",
});

const TabButton = styled("button", {
  appearance: "none",
  width: "100%",
  display: "grid",
  gap: "4px",
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: "12px",
  border:
    "1px solid color-mix(in srgb, var(--colors-comment) 24%, transparent)",
  backgroundColor: "transparent",
  color: "$comment",
  cursor: "pointer",
  transition:
    "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
  "&:hover": {
    backgroundColor:
      "color-mix(in srgb, var(--colors-currentLine) 70%, transparent)",
    borderColor:
      "color-mix(in srgb, var(--colors-comment) 40%, transparent)",
    color: "$foreground",
  },
  '&[data-active="true"]': {
    backgroundColor:
      "color-mix(in srgb, var(--colors-currentLine) 88%, transparent)",
    borderColor: "color-mix(in srgb, var(--colors-cyan) 32%, transparent)",
    color: "$foreground",
    boxShadow: "inset 2px 0 0 var(--colors-cyan)",
  },
});

const TabTitle = styled("span", {
  fontSize: "0.88rem",
  fontWeight: 700,
  color: "inherit",
});

const TabMeta = styled("span", {
  fontSize: "0.78rem",
  color: "$comment",
});

const MainPane = styled("div", {
  padding: "22px 20px 20px",
  display: "grid",
  gap: "18px",
  "@media(min-width: 920px)": {
    padding: "26px 24px 22px",
  },
});

const Hero = styled("section", {
  display: "grid",
  alignContent: "center",
  gap: "12px",
  minHeight: "calc(100vh - 280px)",
  "@media(max-width: 920px)": {
    minHeight: "calc(100vh - 220px)",
  },
});

const HeaderLine = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "$green",
  fontSize: "0.84rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
});

const Title = styled("h1", {
  fontSize: "clamp(1.8rem, 3vw, 3rem)",
  lineHeight: 1.05,
  color: "$foreground",
  margin: 0,
  width: "100%",
  maxWidth: "none",
});

const Lead = styled("p", {
  margin: 0,
  color: "$comment",
  fontSize: "1rem",
  lineHeight: 1.7,
  maxWidth: "100%",
});

const ActionRow = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "4px",
});

const ActionLink = styled("a", {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 14px",
  borderRadius: "999px",
  border: "1px solid color-mix(in srgb, var(--colors-cyan) 38%, transparent)",
  color: "$background",
  backgroundColor: "$cyan",
  fontSize: "0.88rem",
  fontWeight: 700,
  textDecoration: "none",
  "&:hover": {
    transform: "translateY(-1px)",
    boxShadow:
      "0 10px 26px color-mix(in srgb, var(--colors-cyan) 28%, transparent)",
  },
});

const MutedChip = styled("div", {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "999px",
  border:
    "1px solid color-mix(in srgb, var(--colors-comment) 36%, transparent)",
  color: "$comment",
  fontSize: "0.82rem",
});

const SectionGrid = styled("div", {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  "@media(max-width: 920px)": {
    gridTemplateColumns: "1fr",
  },
});

const Card = styled("section", {
  border: "1px solid color-mix(in srgb, var(--colors-comment) 35%, transparent)",
  borderRadius: "14px",
  padding: "14px",
  backgroundColor:
    "color-mix(in srgb, var(--colors-currentLine) 66%, transparent)",
  display: "grid",
  gap: "12px",
});

const CardTitle = styled("h2", {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "0.95rem",
  color: "$foreground",
});

const ReadmeList = styled("div", {
  display: "grid",
  gap: "10px",
});

const ReadmeItem = styled("div", {
  display: "grid",
  gridTemplateColumns: "1.35rem minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
});

const Bullet = styled("span", {
  color: "$cyan",
  fontWeight: 700,
});

const ItemText = styled("div", {
  color: "$comment",
  fontSize: "0.9rem",
  lineHeight: 1.65,
  "& strong": {
    color: "$foreground",
    fontWeight: 700,
  },
});

const HotkeyList = styled("div", {
  display: "grid",
  gap: "12px",
});

const HotkeyRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "minmax(140px, auto) minmax(0, 1fr)",
  gap: "12px",
  alignItems: "center",
  "@media(max-width: 560px)": {
    gridTemplateColumns: "1fr",
  },
});

const KeyCombo = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
});

const Keycap = styled("span", {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  minHeight: "32px",
  padding: "0 10px",
  borderRadius: "8px",
  border:
    "1px solid color-mix(in srgb, var(--colors-comment) 36%, transparent)",
  backgroundColor:
    "color-mix(in srgb, var(--colors-currentLine) 84%, transparent)",
  color: "$foreground",
  fontSize: "0.82rem",
  fontWeight: 700,
  boxShadow: "inset 0 -2px 0 rgba(0, 0, 0, 0.18)",
});

const KeyJoin = styled("span", {
  color: "$comment",
  fontSize: "0.8rem",
});

const HotkeyText = styled("p", {
  margin: 0,
  color: "$comment",
  fontSize: "0.88rem",
  lineHeight: 1.6,
});

const FooterBar = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "10px 14px",
  borderTop:
    "1px solid color-mix(in srgb, var(--colors-comment) 35%, transparent)",
  backgroundColor:
    "color-mix(in srgb, var(--colors-currentLine) 92%, black 8%)",
  color: "$background",
  fontSize: "0.82rem",
});

const FooterMode = styled("span", {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 8px",
  borderRadius: "6px",
  backgroundColor: "$green",
  color: "$background",
  fontWeight: 700,
});

const FooterPath = styled("span", {
  color: "$foreground",
});

const FooterHint = styled("span", {
  color: "$comment",
});

const DOC_TABS = [
  {
    id: "general",
    title: "General",
    meta: "Default documentation",
  },
  {
    id: "financial-workspace",
    title: "Financial Workspace",
    meta: "Active tool documentation",
  },
] as const;

type DocTabId = (typeof DOC_TABS)[number]["id"];

function getCalculatorUrl() {
  const { protocol, hostname, port } = window.location;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  const isIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);

  if (isLocalHost || isIPv4 || !hostname.includes(".")) {
    return null;
  }

  const normalizedHost = hostname.startsWith("www.")
    ? hostname.slice(4)
    : hostname;

  return `${protocol}//f.${normalizedHost}${port ? `:${port}` : ""}`;
}

function getWorkspaceLabel() {
  const host = window.location.hostname
    .replace(/^www\./, "")
    .replace(/^f\./, "");

  if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return "workspace";
  }

  const firstToken = host.split(".")[0]?.trim().toLowerCase();
  return firstToken || "workspace";
}

export default function LandingReadme() {
  const calculatorUrl = getCalculatorUrl();
  const workspaceLabel = getWorkspaceLabel();
  const [activeTab, setActiveTab] = useState<DocTabId>(DOC_TABS[0].id);
  const activeDocument = DOC_TABS.find((tab) => tab.id === activeTab) ?? DOC_TABS[0];
  const isGeneralTab = activeDocument.id === "general";

  return (
    <Page>
      <Window>
        <TitleBar>
          <TitleMeta>
            <Icons.FileTextIcon />
            <span>README</span>
          </TitleMeta>
          <StatusText>normal</StatusText>
        </TitleBar>

        <ContentGrid>
          <CommandRail>
            <RailTitle>
              <Icons.ReaderIcon />
              <span>Documentation</span>
            </RailTitle>
            <TabList>
              {DOC_TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  type="button"
                  data-active={tab.id === activeDocument.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <TabTitle>{tab.title}</TabTitle>
                  <TabMeta>{tab.meta}</TabMeta>
                </TabButton>
              ))}
            </TabList>
          </CommandRail>

          <MainPane>
            <Hero>
              <HeaderLine>
                <Icons.CodeIcon />
                <span>{workspaceLabel} Workbench</span>
              </HeaderLine>
              {isGeneralTab ? (
                <>
                  <Title>General usage and disclaimer</Title>
                  <Lead>
                    This is a guide of general features available in this tool.
                    Most of this project is AI generated and may contain errors.
                    Do not rely on it for decisions without independent
                    verification.
                  </Lead>
                </>
              ) : (
                <>
                  <Title>A practical guide to the financial workspace.</Title>
                  <Lead>
                    This tool supports long-horizon investment modeling with
                    comparison tracks, rollover behavior, target solving,
                    inflation-adjusted views, stock-backed portfolio analysis,
                    and state persistence. This guide will expand as additional
                    tools are added.
                  </Lead>
                  <ActionRow>
                    {calculatorUrl ? (
                      <ActionLink href={calculatorUrl}>
                        <Icons.OpenInNewWindowIcon />
                        <span>Open financial workspace</span>
                      </ActionLink>
                    ) : (
                      <MutedChip>
                        <Icons.GlobeIcon />
                        <span>
                          Financial workspace link is unavailable on this host.
                        </span>
                      </MutedChip>
                    )}
                  </ActionRow>
                </>
              )}
            </Hero>

            {isGeneralTab ? (
              <Card>
                <CardTitle>
                  <Icons.InfoCircledIcon />
                  <span>General usage and disclaimer</span>
                </CardTitle>
                <ReadmeList>
                  <ReadmeItem>
                    <Bullet>•</Bullet>
                    <ItemText>
                      This section is a guide of general features available in
                      this application.
                    </ItemText>
                  </ReadmeItem>
                  <ReadmeItem>
                    <Bullet>•</Bullet>
                    <ItemText>
                      <strong>Theme Switcher</strong> applies the selected color
                      palette immediately.
                    </ItemText>
                  </ReadmeItem>
                  <ReadmeItem>
                    <Bullet>•</Bullet>
                    <ItemText>
                      <strong>Export</strong> saves current state as JSON and
                      <strong> Import</strong> restores a previously saved
                      configuration.
                    </ItemText>
                  </ReadmeItem>
                  <ReadmeItem>
                    <Bullet>•</Bullet>
                    <ItemText>
                      <strong>Hotkeys:</strong> Ctrl+Shift+S opens the stock
                      modal, and Enter submits symbols from the modal input.
                    </ItemText>
                  </ReadmeItem>
                  <ReadmeItem>
                    <Bullet>•</Bullet>
                    <ItemText>
                      Most of this tool is AI generated and should not be
                      trusted without independent review and verification.
                    </ItemText>
                  </ReadmeItem>
                </ReadmeList>
              </Card>
            ) : (
              <SectionGrid>
                <Card>
                  <CardTitle>
                    <Icons.MixerHorizontalIcon />
                    <span>How To Use It</span>
                  </CardTitle>
                  <ReadmeList>
                    <ReadmeItem>
                      <Bullet>1</Bullet>
                      <ItemText>
                        Start with <strong>Investment A</strong>: set the
                        current amount, expected annual return, and time
                        horizon.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>2</Bullet>
                      <ItemText>
                        Enable <strong>Advanced</strong> to unlock monthly
                        contributions, contribution stop year, withdrawals,
                        withdrawal start, and the
                        <strong> Investment B</strong> comparison lane.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>3</Bullet>
                      <ItemText>
                        Use <strong>Target Value</strong> to solve backwards for
                        the monthly withdrawal that lands on your chosen ending
                        balance.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>4</Bullet>
                      <ItemText>
                        Toggle <strong>Inflated</strong> for
                        inflation-adjusted numbers and
                        <strong> Rollover</strong> to roll A into B at A&apos;s
                        finish year.
                      </ItemText>
                    </ReadmeItem>
                  </ReadmeList>
                </Card>

                <Card>
                  <CardTitle>
                    <Icons.BarChartIcon />
                    <span>Outputs</span>
                  </CardTitle>
                  <ReadmeList>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        Click ending totals to open year-by-year tables with
                        nominal value, inflation-adjusted value, and percent
                        change.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        The projection chart overlays Investment A and B,
                        highlights weak performance, and shows dashed target
                        lines.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        Info panels surface target hit timing, contribution and
                        withdrawal milestones, and preservation timing.
                      </ItemText>
                    </ReadmeItem>
                  </ReadmeList>
                </Card>

                <Card>
                  <CardTitle>
                    <Icons.KeyboardIcon />
                    <span>Hotkeys</span>
                  </CardTitle>
                  <HotkeyList>
                    <HotkeyRow>
                      <KeyCombo>
                        <Keycap>
                          <Icons.KeyboardIcon />
                          Ctrl
                        </Keycap>
                        <KeyJoin>+</KeyJoin>
                        <Keycap>Shift</Keycap>
                        <KeyJoin>+</KeyJoin>
                        <Keycap>S</Keycap>
                      </KeyCombo>
                      <HotkeyText>
                        Open or close the stock data modal from anywhere in the
                        app.
                      </HotkeyText>
                    </HotkeyRow>
                    <HotkeyRow>
                      <KeyCombo>
                        <Keycap>
                          <Icons.EnterIcon />
                          Enter
                        </Keycap>
                      </KeyCombo>
                      <HotkeyText>
                        Inside the stock modal symbol field, submit the current
                        comma-separated ticker list.
                      </HotkeyText>
                    </HotkeyRow>
                  </HotkeyList>
                </Card>

                <Card>
                  <CardTitle>
                    <Icons.GearIcon />
                    <span>Portfolio Mode</span>
                  </CardTitle>
                  <ReadmeList>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        Toggle <strong>Portfolio</strong> to map the calculated
                        total into a stock allocation model.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        Add symbols, fetch prices, set allocations to 100%, and
                        generate withdrawal-based projections.
                      </ItemText>
                    </ReadmeItem>
                    <ReadmeItem>
                      <Bullet>•</Bullet>
                      <ItemText>
                        Capital preservation schedules show the required price
                        path per holding for the active withdrawal window.
                      </ItemText>
                    </ReadmeItem>
                  </ReadmeList>
                </Card>
              </SectionGrid>
            )}
          </MainPane>
        </ContentGrid>

        <FooterBar>
          <FooterMode>
            <Icons.CodeIcon />
            {activeDocument.title}
          </FooterMode>
          <FooterPath>~/{workspaceLabel}/README</FooterPath>
          <FooterHint>Live reference for current tool capabilities</FooterHint>
        </FooterBar>
      </Window>
    </Page>
  );
}
