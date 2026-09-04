/* ==================================================
 * Error Boundary
 *
 * A render error would otherwise unmount the whole tree and leave a blank
 * page.  That is unusually sticky here: state is hydrated from localStorage
 * on boot, so a stored state that crashes render crashes every reload with
 * no way back in.
 *
 * The escape hatch therefore offers rescue before destruction — download the
 * stored state first, reset it second.
 * ================================================== */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { format } from "date-fns/format";
import { styled } from "../../stitches.config";
import {
  FILE_EXPORT_PREFIX,
  FILE_EXPORT_EXTENSION,
} from "../common/constants/app-constants";
import {
  STORAGE_KEY,
  purgeStoredData,
  storeOrNull,
} from "../common/helpers/persistence";
import { ActionButton, SecondaryButton } from "./ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

const Shell = styled("div", {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem 1rem",
  backgroundColor: "$background",
  color: "$foreground",
});

const Card = styled("div", {
  width: "min(640px, 100%)",
  backgroundColor: "$currentLine",
  borderRadius: 12,
  padding: "1.75rem",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
});

const Title = styled("h1", {
  margin: 0,
  marginBottom: "0.75rem",
  fontSize: "1.1rem",
  fontWeight: 600,
  color: "$red",
});

const Body = styled("p", {
  margin: "0 0 1rem",
  fontSize: "0.85rem",
  lineHeight: 1.55,
  color: "$foreground",
});

const Note = styled("p", {
  margin: "0.75rem 0 0",
  fontSize: "0.75rem",
  color: "$comment",
});

const Details = styled("details", {
  margin: "0 0 1.25rem",
  fontSize: "0.75rem",
  color: "$comment",
  "& summary": { cursor: "pointer" },
  "& pre": {
    marginTop: "0.5rem",
    maxHeight: 220,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
});

const Message = styled("pre", {
  margin: "0 0 1.25rem",
  padding: "0.65rem 0.75rem",
  borderRadius: 6,
  backgroundColor: "$background",
  color: "$red",
  fontSize: "0.78rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const ButtonRow = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
});

// ActionButton/SecondaryButton are declared with `all: unset`, which suppresses
// the user agent's focus ring. This screen is reached by keyboard as often as
// by mouse, so put one back for the three buttons on it.
const PrimaryButton = styled(ActionButton, {
  "&:focus-visible": {
    outline: "2px solid $colors$cyan",
    outlineOffset: 2,
    borderRadius: 5,
  },
});

const NeutralButton = styled(SecondaryButton, {
  "&:focus-visible": {
    outline: "2px solid $colors$cyan",
    outlineOffset: 2,
    borderRadius: 5,
  },
});

const DangerButton = styled(NeutralButton, {
  backgroundColor: "$red",
  color: "$background",
  fontWeight: 600,
});

/* ==================================================
 * Helpers
 * ================================================== */

/** A thrown value need not be an Error, so never assume it is one */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Hands back the stored blob exactly as stored — no parsing, no normalising.
 * The state that broke the app is precisely the state worth keeping a copy of,
 * and rewriting it on the way out could destroy the evidence.
 */
function downloadStoredState(raw: string): void {
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    const stamp = format(new Date(), "yyyyMMdd'T'HHmmss");
    link.download = `${FILE_EXPORT_PREFIX}_rescue_${stamp}.${FILE_EXPORT_EXTENSION}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ==================================================
 * Component
 * ================================================== */

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
  hasError: boolean;
  componentStack: string | null;
  downloaded: boolean;
  /** Erasing the user's saved plan should never be one stray click */
  confirmingReset: boolean;
}

const INITIAL_STATE: State = {
  error: null,
  hasError: false,
  componentStack: null,
  downloaded: false,
  confirmingReset: false,
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, hasError: true };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo): void {
    // Kept in the UI rather than only the console: this app ships without
    // telemetry, so what the user can read is all the diagnosis there is.
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private handleDownload = (): void => {
    const raw = storeOrNull()?.getItem(STORAGE_KEY);
    if (!raw) return;
    downloadStoredState(raw);
    this.setState({ downloaded: true });
  };

  private handleReset = (): void => {
    purgeStoredData();
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { componentStack, confirmingReset, downloaded, error } = this.state;
    const stored = storeOrNull()?.getItem(STORAGE_KEY) ?? null;

    return (
      <Shell role="alert">
        <Card>
          <Title>Something went wrong</Title>
          <Body>
            The app stopped while rendering. Anything you saved is still in this
            browser. Download a copy first — resetting deletes it.
          </Body>
          <Message>{describeError(error)}</Message>
          {componentStack && (
            <Details>
              <summary>Where it happened</summary>
              <pre>{componentStack}</pre>
            </Details>
          )}

          <ButtonRow>
            <PrimaryButton
              type="button"
              onClick={this.handleDownload}
              disabled={!stored}
            >
              {downloaded ? "Download again" : "Download my data"}
            </PrimaryButton>

            {confirmingReset ? (
              <>
                <DangerButton type="button" onClick={this.handleReset}>
                  Delete saved data and reload
                </DangerButton>
                <NeutralButton
                  type="button"
                  onClick={() => {
                    this.setState({ confirmingReset: false });
                  }}
                >
                  Keep it
                </NeutralButton>
              </>
            ) : (
              <NeutralButton
                type="button"
                onClick={() => {
                  this.setState({ confirmingReset: true });
                }}
              >
                Reset stored data
              </NeutralButton>
            )}

            <NeutralButton
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </NeutralButton>
          </ButtonRow>

          {!stored && (
            <Note>
              Nothing is saved in this browser, so there is nothing to download
              and nothing for a reset to clear.
            </Note>
          )}
        </Card>
      </Shell>
    );
  }
}
