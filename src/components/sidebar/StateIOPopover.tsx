// src/components/sidebar/StateIOButtons.tsx
import React from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";

/* ---------------- STYLES ---------------- */

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

/* ---------------- TYPES ---------------- */

interface Props {
  getState: () => any;
  setState: (state: any) => void;
}

/* ---------------- COMPONENT ---------------- */

export default function StateIOButtons({ getState, setState }: Props) {
  /* -------- EXPORT -------- */
  const handleExport = () => {
    const data = getState();
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.-]/g, "")
      .slice(0, 15); // YYYYMMDDTHHMMSS
    const filename = `th4_${timestamp}.json`;

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

  /* -------- IMPORT -------- */
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
        <FileInput type="file" accept=".json" onChange={handleImport} />
      </label>
    </div>
  );
}