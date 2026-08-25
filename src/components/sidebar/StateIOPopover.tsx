/* ==================================================
 * State Import/Export Popover Component
 * ================================================== */

import React, { useRef, useState } from "react";
import { format } from "date-fns";
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
  | { kind: "decrypt-import"; envelope: EncryptedEnvelope };

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

  const isExport = pending?.kind === "encrypt-export";

  const closeDialog = () => {
    activeRef.current = null;
    setPending(null);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setBusy(false);
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

    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.target?.result as string);
        if (isEncryptedEnvelope(parsed)) {
          setPending({ kind: "decrypt-import", envelope: parsed });
          return;
        }
        if (!isValidTH4State(parsed)) {
          alert(
            "Invalid state file: the JSON does not match the expected format.",
          );
          return;
        }
        setState(parsed);
      } catch {
        alert("Invalid JSON file: the file could not be parsed.");
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
    const parsed: unknown = JSON.parse(
      await decryptFromEnvelope(envelope, password),
    );
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
    if (!pending || busy) return;
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
        enabled={encryptExports}
        onClick={() => setEncryptExports((v) => !v)}
        title={
          encryptExports
            ? "Encrypted export: on — exported files are password-protected"
            : "Encrypted export: off — exported files are plain text"
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
      <SidebarButton onClick={handleExport} title="Export JSON">
        <Icons.DownloadIcon width={20} height={20} />
      </SidebarButton>

      {/* Import button */}
      <label>
        <SidebarButton as="span" title="Import JSON">
          <Icons.UploadIcon width={20} height={20} />
        </SidebarButton>
        <FileInput
          type="file"
          accept={`.${FILE_EXPORT_EXTENSION}`}
          onChange={handleImport}
        />
      </label>

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

            {/* A real form lets the browser route Enter: submit from the inputs, activate on the buttons */}
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
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
