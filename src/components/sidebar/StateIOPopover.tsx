/* ==================================================
 * State Import/Export Popover Component
 * ================================================== */

import React, { useState } from "react";
import { format } from "date-fns";
import * as Icons from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { styled, keyframes } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
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

const FileInput = styled("input", {
  display: "none",
});

const overlayShow = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const contentShow = keyframes({
  from: { opacity: 0, transform: "translate(-50%, -52%) scale(0.96)" },
  to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

const Overlay = styled(Dialog.Overlay, {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  animation: `${String(overlayShow)} 150ms ease`,
  zIndex: 100,
});

const Content = styled(Dialog.Content, {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(380px, 90vw)",
  backgroundColor: "$background",
  border: "1px solid $currentLine",
  borderRadius: 8,
  padding: "1.5rem",
  animation: `${String(contentShow)} 150ms ease`,
  zIndex: 101,
  "&:focus": { outline: "none" },
});

const Title = styled(Dialog.Title, {
  margin: 0,
  marginBottom: "0.5rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "$foreground",
});

const Description = styled(Dialog.Description, {
  margin: "0 0 1rem",
  fontSize: "0.8rem",
  color: "$comment",
});

const Label = styled("label", {
  display: "block",
  fontSize: "0.75rem",
  color: "$comment",
  marginBottom: "0.25rem",
  userSelect: "none",
});

const Input = styled("input", {
  ...compactModernInputStyles,
  borderRadius: 7,
  padding: "0.5rem 0.7rem",
  marginBottom: "0.85rem",
});

const ErrorText = styled("p", {
  color: "$red",
  fontSize: "0.75rem",
  margin: "-0.5rem 0 0.85rem",
});

const ButtonRow = styled("div", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
});

const ActionButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$purple",
  color: "$background",
  padding: "0.5rem 1rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
});

const SecondaryButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$currentLine",
  color: "$foreground",
  padding: "0.5rem 0.75rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
});

const CloseButton = styled(Dialog.Close, {
  all: "unset",
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  cursor: "pointer",
  color: "$comment",
  display: "flex",
  "&:hover": { color: "$foreground" },
});

const EncryptRow = styled("div", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.5rem 0.75rem",
  marginBottom: "0.25rem",
});

const EncryptLabel = styled("span", {
  fontSize: "0.8rem",
  color: "$foreground",
});

const SwitchRoot = styled(Switch.Root, {
  all: "unset",
  width: 36,
  height: 20,
  backgroundColor: "$comment",
  borderRadius: "9999px",
  position: "relative",
  cursor: "pointer",
  flexShrink: 0,
  "&[data-state='checked']": { backgroundColor: "$purple" },
});

const SwitchThumb = styled(Switch.Thumb, {
  display: "block",
  width: 16,
  height: 16,
  backgroundColor: "$foreground",
  borderRadius: "9999px",
  transition: "transform 0.2s",
  transform: "translateX(2px)",
  "[data-state='checked'] &": { transform: "translateX(18px)" },
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

  const closeDialog = () => {
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

  const submitEncryptExport = async (data: TH4State) => {
    if (password.length === 0) {
      setError("Enter a password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const envelope = await encryptToEnvelope(JSON.stringify(data), password);
      downloadJson(envelope);
      closeDialog();
    } catch {
      setError("Encryption failed. Please try again.");
      setBusy(false);
    }
  };

  const submitDecryptImport = async (envelope: EncryptedEnvelope) => {
    if (password.length === 0) {
      setError("Enter the password.");
      return;
    }
    setBusy(true);
    try {
      const json = await decryptFromEnvelope(envelope, password);
      const parsed: unknown = JSON.parse(json);
      if (!isValidTH4State(parsed)) {
        setError("Decrypted file does not match the expected format.");
        setBusy(false);
        return;
      }
      setState(parsed);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decryption failed.");
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (!pending) return;
    setError(null);
    if (pending.kind === "encrypt-export") {
      void submitEncryptExport(pending.data);
    } else {
      void submitDecryptImport(pending.envelope);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <EncryptRow title="Encrypt exported files with a password so the saved numbers aren't stored in plain text">
        <EncryptLabel>Encrypt export</EncryptLabel>
        <SwitchRoot
          checked={encryptExports}
          onCheckedChange={setEncryptExports}
        >
          <SwitchThumb />
        </SwitchRoot>
      </EncryptRow>

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
          <Overlay />
          <Content
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            <CloseButton aria-label="Close">
              <Icons.Cross2Icon />
            </CloseButton>

            {pending?.kind === "encrypt-export" ? (
              <>
                <Title>Encrypt export</Title>
                <Description>
                  Choose a password to encrypt this file. You'll need it to
                  import the file again — it isn't stored anywhere.
                </Description>
                <Label htmlFor="th4-export-password">Password</Label>
                <Input
                  id="th4-export-password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Label htmlFor="th4-export-password-confirm">
                  Confirm password
                </Label>
                <Input
                  id="th4-export-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </>
            ) : (
              <>
                <Title>Encrypted file</Title>
                <Description>
                  This file is password-protected. Enter the password to
                  import it.
                </Description>
                <Label htmlFor="th4-import-password">Password</Label>
                <Input
                  id="th4-import-password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            )}

            {error && <ErrorText>{error}</ErrorText>}

            <ButtonRow>
              <SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton>
              <ActionButton onClick={handleSubmit} disabled={busy}>
                {busy
                  ? "Working…"
                  : pending?.kind === "encrypt-export"
                    ? "Encrypt & Download"
                    : "Decrypt"}
              </ActionButton>
            </ButtonRow>
          </Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
