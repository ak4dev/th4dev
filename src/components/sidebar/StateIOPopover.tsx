/* ==================================================
 * State Import/Export Popover Component
 * ================================================== */

import React from "react";
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
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.-]/g, "")
      .slice(0, 15); // Format: YYYYMMDDTHHMMSS
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
   * Imports application state from a JSON file
   * @param e - File input change event
   */
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setState(parsed);
      } catch {
        alert("Invalid JSON file");
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
