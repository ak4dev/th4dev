/* ==================================================
 * Scenario Snapshots Panel
 *
 * Allows users to save, load, rename, delete, and
 * compare named snapshots of their investment
 * configuration.
 * ================================================== */

import { useState } from "react";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import type { TH4State } from "../../common/types/types";
import {
  saveScenario,
  deleteScenario,
  renameScenario,
  getSnapshotPreview,
  MAX_SCENARIOS,
  type ScenarioSnapshot,
} from "../../common/helpers/scenario-manager";
import { formatCurrency } from "../../common/helpers/format";
import {
  PanelContainer,
  PanelTitle,
  PanelButton,
  CountLabel,
  EmptyMessage,
} from "../ui/primitives";

/* ---------- Props ---------- */

interface ScenarioPanelProps {
  currentState: TH4State;
  onLoadScenario: (state: TH4State) => void;
  /** Scenarios managed by parent */
  scenarios: ScenarioSnapshot[];
  /** Setter for scenarios */
  setScenarios: (scenarios: ScenarioSnapshot[]) => void;
}

/* ---------- Styled Components ---------- */

const SaveRow = styled("div", {
  display: "flex",
  gap: "8px",
  marginBottom: "16px",
});

const Input = styled("input", {
  ...compactModernInputStyles,
  flex: 1,
});

const ScenarioList = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const ScenarioCard = styled("div", {
  backgroundColor: "$background",
  borderRadius: "8px",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const CardTop = styled("div", {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

const ScenarioName = styled("span", {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "$foreground",
});

const ScenarioMeta = styled("span", {
  fontSize: "0.72rem",
  color: "$comment",
});

const CardActions = styled("div", {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
});

/* ---------- Helpers ---------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- Component ---------- */

export default function ScenarioPanel({
  currentState,
  onLoadScenario,
  scenarios,
  setScenarios,
}: ScenarioPanelProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const canSave = newName.trim().length > 0 && scenarios.length < MAX_SCENARIOS;

  const handleSave = () => {
    if (!canSave) return;
    setScenarios(saveScenario(newName.trim(), currentState, scenarios));
    setNewName("");
  };

  const startRename = (scenario: ScenarioSnapshot) => {
    setEditingId(scenario.id);
    setEditName(scenario.name);
  };

  const finishRename = () => {
    if (editingId && editName.trim()) {
      setScenarios(renameScenario(editingId, editName.trim(), scenarios));
    }
    setEditingId(null);
    setEditName("");
  };

  return (
    <PanelContainer>
      <PanelTitle>
        Scenario Snapshots{" "}
        <CountLabel>
          ({scenarios.length}/{MAX_SCENARIOS})
        </CountLabel>
      </PanelTitle>

      <SaveRow>
        <Input
          placeholder="Scenario name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          maxLength={60}
        />
        <PanelButton color="cyan" disabled={!canSave} onClick={handleSave}>
          Save
        </PanelButton>
      </SaveRow>

      <ScenarioList>
        {scenarios.length === 0 && (
          <EmptyMessage css={{ padding: "16px 0" }}>
            No saved scenarios yet. Save one to compare later.
          </EmptyMessage>
        )}
        {scenarios.map((s) => {
          const preview = getSnapshotPreview(s);
          const isEditing = editingId === s.id;

          return (
            <ScenarioCard key={s.id}>
              <CardTop>
                {isEditing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && finishRename()}
                    onBlur={finishRename}
                    autoFocus
                    maxLength={60}
                    css={{ marginRight: "8px" }}
                  />
                ) : (
                  <ScenarioName>{s.name}</ScenarioName>
                )}
              </CardTop>
              <ScenarioMeta>
                {formatDate(s.createdAt)} ·{" "}
                {formatCurrency(parseInt(preview.investmentA) || 0)} ·{" "}
                {preview.returnPct}% · {preview.years}yr
              </ScenarioMeta>
              <CardActions>
                <PanelButton
                  color="green"
                  onClick={() => onLoadScenario(s.state)}
                >
                  Load
                </PanelButton>
                {!isEditing && (
                  <PanelButton color="muted" onClick={() => startRename(s)}>
                    Rename
                  </PanelButton>
                )}
                <PanelButton
                  color="red"
                  onClick={() => setScenarios(deleteScenario(s.id, scenarios))}
                >
                  Delete
                </PanelButton>
              </CardActions>
            </ScenarioCard>
          );
        })}
      </ScenarioList>
    </PanelContainer>
  );
}
