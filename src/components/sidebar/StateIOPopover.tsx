/* ==================================================
 * State Import/Export Popover Component
 * ================================================== */

import React, { useRef, useState } from "react";
import { format } from "date-fns/format";
import * as Icons from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { styled } from "../../../stitches.config";
import {
  FILE_EXPORT_PREFIX,
  FILE_EXPORT_EXTENSION,
} from "../../common/constants/app-constants";
import { isValidTH4State } from "../../common/helpers/state-manager";
import {
  encryptToEnvelope,
  decryptFromEnvelope,
  isEncryptedEnvelope,
  isEncryptedFile,
  unsupportedFileMessage,
} from "../../common/helpers/crypto-manager";
import type { EncryptedEnvelope } from "../../common/helpers/crypto-manager";
import type { TH4State } from "../../common/types/types";
import {
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogLabel,
  DialogInput,
  DialogCloseButton,
  ActionButton,
  SecondaryButton,
  ErrorText,
} from "../ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

const SidebarButton = styled("button", {
  all: "unset",
  color: "$foreground",
  padding: "0.75rem",
  marginBottom: "0.5rem",
  cursor: "pointer",
  borderRadius: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: "$purple",
  },
});

const EncryptToggleButton = styled(SidebarButton, {
  color: "$comment",
  transition: "background-color 0.2s ease, color 0.2s ease",
  "&:hover": { color: "$foreground" },
  variants: {
    enabled: {
      true: { color: "$green" },
    },
  },
});

const FileInput = styled("input", {
  display: "none",
});

const Title = styled(DialogTitle, { marginBottom: "0.5rem" });

const Description = styled(Dialog.Description, {
  margin: "0 0 1rem",
  fontSize: "0.8rem",
  color: "$comment",
});

const Input = styled(DialogInput, { marginBottom: "0.85rem" });

const ButtonRow = styled("div", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
});

/**
 * The one place a plain export is described before it happens. Encryption off
 * downloads immediately with no dialog, so the warning has to live beside the
 * button rather than in a step that never runs.
 */
const PlainExportNote = styled("p", {
  margin: "0 0 0.5rem",
  padding: "0 4px",
  fontSize: "0.55rem",
  lineHeight: 1.3,
  textAlign: "center",
  color: "$orange",
});

/* ==================================================
 * Copy
 * ================================================== */

/**
 * A plain export is the whole state verbatim, and the state includes
 * stock.apiUrl - the URL the user's market-data API key lives in. These files
 * get handed around when people ask for help, so what is in the file is named
 * before it is written rather than discovered afterwards.
 *
 * Omitting the field instead would silently lose the user's endpoint on
 * re-import and leave the plain and encrypted exports carrying different
 * plans, so the fix is the warning, not a quieter file.
 */
const PLAIN_EXPORT_WARNING =
  "Encrypted export: off - the file is plain text and includes the stock API URL, so it carries any API key inside it";

/** The same fact, short enough for the 60px sidebar rail */
const PLAIN_EXPORT_NOTE = "Plain export includes your API key";

/* ==================================================
 * Types
 * ================================================== */

/**
 * Props for the StateIOButtons component
 */
interface Props {
  /** Function to get current application state */
  getState: () => TH4State;
  /** Function to set application state from imported data */
  setState: (state: TH4State) => void;
}

type PendingAction =
  | { kind: "encrypt-export"; data: TH4State }
  | { kind: "decrypt-import"; envelope: EncryptedEnvelope }
  /** A read-only message in the same dialog — the sidebar rail is too narrow to hold one */
  | { kind: "notice"; message: string };

/* ==================================================
 * Component
 * ================================================== */

/**
 * State import/export buttons component
 * Allows users to save and load application state as JSON files
 */
export default function StateIOButtons({ getState, setState }: Props) {
  const [encryptExports, setEncryptExports] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The request whose result may still be applied; cleared when the dialog closes */
  const activeRef = useRef<PendingAction | null>(null);
  /** The hidden file input the Import button clicks on the user's behalf */
  const fileRef = useRef<HTMLInputElement>(null);

  const isExport = pending?.kind === "encrypt-export";

  /** Drops any in-flight request and clears the dialog's transient fields */
  const resetDialogState = () => {
    activeRef.current = null;
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setBusy(false);
  };

  const closeDialog = () => {
    resetDialogState();
    setPending(null);
  };

  /**
   * Reports a failure the user cannot act on, in the dialog. alert() blocks
   * the tab, ignores the theme and cannot be styled or tested; the sidebar
   * rail it would otherwise sit next to is only 60px wide.
   */
  const showNotice = (message: string) => {
    resetDialogState();
    setPending({ kind: "notice", message });
  };

  const downloadJson = (contents: unknown) => {
    const timestamp = format(new Date(), "yyyyMMdd'T'HHmmss");
    const filename = `${FILE_EXPORT_PREFIX}_${timestamp}.${FILE_EXPORT_EXTENSION}`;
    const blob = new Blob([JSON.stringify(contents, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  /**
   * Exports current application state as a JSON file, encrypting it first
   * if the "Encrypt export" toggle is on (the default).
   */
  const handleExport = () => {
    const data = getState();
    if (encryptExports) {
      setPending({ kind: "encrypt-export", data });
      return;
    }
    downloadJson(data);
  };

  /**
   * Imports application state from a JSON file. Detects an encrypted
   * envelope and prompts for a password before decrypting; otherwise
   * validates the plain state shape directly, as before.
   * @param e - File input change event
   */
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();

    // Without this a read failure (a directory, a revoked permission, an
    // unreadable device) leaves the user staring at a picker that did nothing.
    reader.onerror = () => {
      showNotice("The file could not be read. Please try again.");
    };

    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.target?.result as string);
        if (isEncryptedEnvelope(parsed)) {
          setPending({ kind: "decrypt-import", envelope: parsed });
          return;
        }
        if (isEncryptedFile(parsed)) {
          // One of ours, but not a shape this build can decrypt. Saying so
          // beats asking for a password we could never use.
          showNotice(unsupportedFileMessage(parsed));
          return;
        }
        if (!isValidTH4State(parsed)) {
          showNotice(
            "Invalid state file: the JSON does not match the expected format.",
          );
          return;
        }
        setState(parsed);
      } catch {
        showNotice("Invalid JSON file: the file could not be parsed.");
      }
    };

    reader.readAsText(file);
  };

  /** Encrypts the state; resolves to the download step */
  const encryptExport = async (data: TH4State) => {
    let envelope: EncryptedEnvelope;
    try {
      envelope = await encryptToEnvelope(JSON.stringify(data), password);
    } catch {
      throw new Error("Encryption failed. Please try again.");
    }
    return () => downloadJson(envelope);
  };

  /** Decrypts and validates the envelope; resolves to the import step */
  const decryptImport = async (envelope: EncryptedEnvelope) => {
    const plaintext = await decryptFromEnvelope(envelope, password);
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      // Authenticated, so it was encrypted by something — just not by us.
      throw new Error("The decrypted file is not valid JSON.");
    }
    if (!isValidTH4State(parsed)) {
      throw new Error("Decrypted file does not match the expected format.");
    }
    return () => setState(parsed);
  };

  /**
   * Runs `work` for `req` with the busy flag set. The resulting apply step
   * (download / import) only runs if the dialog was not cancelled meanwhile.
   */
  const runBusy = async (
    req: PendingAction,
    work: () => Promise<() => void>,
  ) => {
    activeRef.current = req;
    setBusy(true);
    try {
      const apply = await work();
      if (activeRef.current !== req) return;
      apply();
      closeDialog();
    } catch (err) {
      if (activeRef.current !== req) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (!pending || busy || pending.kind === "notice") return;
    if (password.length === 0) {
      setError(isExport ? "Enter a password." : "Enter the password.");
      return;
    }
    if (isExport && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    void runBusy(
      pending,
      pending.kind === "encrypt-export"
        ? () => encryptExport(pending.data)
        : () => decryptImport(pending.envelope),
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <EncryptToggleButton
        type="button"
        enabled={encryptExports}
        onClick={() => setEncryptExports((v) => !v)}
        aria-label="Encrypt export"
        title={
          encryptExports
            ? "Encrypted export: on — exported files are password-protected"
            : PLAIN_EXPORT_WARNING
        }
        aria-pressed={encryptExports}
      >
        {encryptExports ? (
          <Icons.LockClosedIcon width={20} height={20} />
        ) : (
          <Icons.LockOpen2Icon width={20} height={20} />
        )}
      </EncryptToggleButton>

      {/* Export button */}
      <SidebarButton
        type="button"
        onClick={handleExport}
        title={
          encryptExports ? "Export JSON (encrypted)" : PLAIN_EXPORT_WARNING
        }
        aria-label="Export JSON"
      >
        <Icons.DownloadIcon width={20} height={20} />
      </SidebarButton>
      {!encryptExports && (
        <PlainExportNote>{PLAIN_EXPORT_NOTE}</PlainExportNote>
      )}

      {/* Import button: a real button, not a <label> wrapping a <span>, so that
          restoring a saved plan is reachable from the keyboard. The input stays
          in the DOM but out of the tab order — clicking it is this button's job. */}
      <SidebarButton
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Import JSON"
        aria-label="Import JSON"
      >
        <Icons.UploadIcon width={20} height={20} />
      </SidebarButton>
      <FileInput
        ref={fileRef}
        type="file"
        tabIndex={-1}
        aria-hidden
        accept={`.${FILE_EXPORT_EXTENSION}`}
        onChange={handleImport}
      />

      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <Dialog.Portal>
          <DialogOverlay />
          <DialogContent size="sm">
            <DialogCloseButton aria-label="Close">
              <Icons.Cross2Icon />
            </DialogCloseButton>

            {pending?.kind === "notice" ? (
              <>
                <Title>Import failed</Title>
                {/* asChild keeps Radix's aria-describedby on the message itself */}
                <Dialog.Description asChild>
                  <ErrorText css={{ margin: "0 0 1rem" }}>
                    {pending.message}
                  </ErrorText>
                </Dialog.Description>
                <ButtonRow>
                  <ActionButton type="button" autoFocus onClick={closeDialog}>
                    Close
                  </ActionButton>
                </ButtonRow>
              </>
            ) : (
              /* A real form lets the browser route Enter: submit from the inputs, activate on the buttons */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <Title>{isExport ? "Encrypt export" : "Encrypted file"}</Title>
                <Description>
                  {isExport
                    ? "Choose a password to encrypt this file. You'll need it to import the file again — it isn't stored anywhere."
                    : "This file is password-protected. Enter the password to import it."}
                </Description>
                <DialogLabel htmlFor="th4-password">Password</DialogLabel>
                <Input
                  id="th4-password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {isExport && (
                  <>
                    <DialogLabel htmlFor="th4-password-confirm">
                      Confirm password
                    </DialogLabel>
                    <Input
                      id="th4-password-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </>
                )}

                {error && (
                  <ErrorText css={{ margin: "-0.5rem 0 0.85rem" }}>
                    {error}
                  </ErrorText>
                )}

                <ButtonRow>
                  <SecondaryButton type="button" onClick={closeDialog}>
                    Cancel
                  </SecondaryButton>
                  <ActionButton type="submit" disabled={busy}>
                    {busy
                      ? "Working…"
                      : isExport
                        ? "Encrypt & Download"
                        : "Decrypt"}
                  </ActionButton>
                </ButtonRow>
              </form>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
