/* ==================================================
 * State Import/Export Popover Component
 * ================================================== */

import React from "react";
import { format } from "date-fns";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";
import {
  FILE_EXPORT_PREFIX,
  FILE_EXPORT_EXTENSION,
} from "../../common/constants/app-constants";
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

/* ==================================================
 * Type Guard
 * ================================================== */

/**
 * Runtime type guard that verifies an unknown value conforms to the TH4State shape.
 * Prevents applying malformed or incompatible JSON files as application state.
 * @param value - The parsed JSON value to validate
 * @returns True if value is a valid TH4State object
 */
function isTH4State(value: unknown): value is TH4State {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["theme"] !== "string") return false;
  if (typeof v["sliders"] !== "object" || v["sliders"] === null) return false;
  if (typeof v["inputs"] !== "object" || v["inputs"] === null) return false;
  if (typeof v["toggles"] !== "object" || v["toggles"] === null) return false;
  const t = v["toggles"] as Record<string, unknown>;
  return (
    typeof t["advanced"] === "boolean" &&
    typeof t["rollover"] === "boolean" &&
    typeof t["showInflation"] === "boolean" &&
    typeof t["portfolio"] === "boolean" &&
    (t["fees"] === undefined || typeof t["fees"] === "boolean") &&
    (t["monteCarlo"] === undefined || typeof t["monteCarlo"] === "boolean") &&
    (t["fire"] === undefined || typeof t["fire"] === "boolean") &&
    (t["scenarios"] === undefined || typeof t["scenarios"] === "boolean")
  );
}

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

/* ==================================================
 * Component
 * ================================================== */

/**
 * State import/export buttons component
 * Allows users to save and load application state as JSON files
 */
export default function StateIOButtons({ getState, setState }: Props) {
  /**
   * Exports current application state as a JSON file
   */
  const handleExport = () => {
    const data = getState();
    // Use compact ISO 8601 basic format (colons and dots omitted for filename safety)
    const timestamp = format(new Date(), "yyyyMMdd'T'HHmmss");
    const filename = `${FILE_EXPORT_PREFIX}_${timestamp}.${FILE_EXPORT_EXTENSION}`;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * Imports application state from a JSON file.
   * Validates that the parsed JSON matches the expected TH4State shape before applying.
   * @param e - File input change event
   */
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.target?.result as string);
        if (!isTH4State(parsed)) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
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
    </div>
  );
}
