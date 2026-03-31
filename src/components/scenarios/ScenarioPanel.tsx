/* ==================================================
 * Scenario Snapshots Panel
 *
 * Allows users to save, load, rename, delete, and
 * compare named snapshots of their investment
 * configuration.
 * ================================================== */

import { useState, useCallback, useMemo } from "react";
import { styled } from "../../../stitches.config";
import type { TH4State } from "../../common/types/types";
import {
  loadScenarios,
  saveScenario,
  deleteScenario,
  renameScenario,
  getSnapshotPreview,
  MAX_SCENARIOS,
  type ScenarioSnapshot,
} from "../../common/helpers/scenario-manager";

/* ---------- Props ---------- */

interface ScenarioPanelProps {
  currentState: TH4State;
  onLoadScenario: (state: TH4State) => void;
}

/* ---------- Styled Components ---------- */

const Container = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  marginTop: "24px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
});

const Title = styled("h4", {
  margin: 0,
  marginBottom: "16px",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "$cyan",
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

const SaveRow = styled("div", {
  display: "flex",
  gap: "8px",
  marginBottom: "16px",
});

const Input = styled("input", {
  flex: 1,
  backgroundColor: "$background",
  border: "1px solid $comment",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "0.85rem",
  color: "$foreground",
  outline: "none",
  "&:focus": {
    borderColor: "$cyan",
  },
  "&::placeholder": {
    color: "$comment",
  },
});

const Button = styled("button", {
  borderRadius: "6px",
  border: "none",
  padding: "8px 14px",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s",
  "&:hover": {
    opacity: 0.85,
  },
  "&:disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  variants: {
    color: {
      cyan: {
        backgroundColor: "$cyan",
        color: "$background",
      },
      green: {
        backgroundColor: "$green",
        color: "$background",
      },
      red: {
        backgroundColor: "$red",
        color: "$background",
      },
      muted: {
        backgroundColor: "$comment",
        color: "$background",
      },
    },
  },
  defaultVariants: {
    color: "cyan",
  },
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

const EmptyMessage = styled("p", {
  fontSize: "0.82rem",
  color: "$comment",
  textAlign: "center",
  padding: "16px 0",
  margin: 0,
});

const CountLabel = styled("span", {
  fontSize: "0.72rem",
  color: "$comment",
  fontWeight: 400,
});

/* ---------- Helpers ---------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ---------- Component ---------- */

export default function ScenarioPanel({
  currentState,
  onLoadScenario,
}: ScenarioPanelProps) {
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[]>(loadScenarios);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const canSave = useMemo(
    () => newName.trim().length > 0 && scenarios.length < MAX_SCENARIOS,
    [newName, scenarios.length],
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;
    try {
      const updated = saveScenario(newName.trim(), currentState, scenarios);
      setScenarios(updated);
      setNewName("");
    } catch {
      // max reached
    }
  }, [canSave, newName, currentState, scenarios]);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = deleteScenario(id, scenarios);
      setScenarios(updated);
    },
    [scenarios],
  );

  const handleLoad = useCallback(
    (scenario: ScenarioSnapshot) => {
      onLoadScenario(scenario.state);
    },
    [onLoadScenario],
  );

  const handleStartRename = useCallback((scenario: ScenarioSnapshot) => {
    setEditingId(scenario.id);
    setEditName(scenario.name);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingId && editName.trim()) {
      const updated = renameScenario(editingId, editName.trim(), scenarios);
      setScenarios(updated);
    }
    setEditingId(null);
    setEditName("");
  }, [editingId, editName, scenarios]);

  return (
    <Container>
      <Title>
        📸 Scenario Snapshots{" "}
        <CountLabel>
          ({scenarios.length}/{MAX_SCENARIOS})
        </CountLabel>
      </Title>

      <SaveRow>
        <Input
          placeholder="Scenario name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          maxLength={60}
        />
        <Button color="cyan" disabled={!canSave} onClick={handleSave}>
          Save
        </Button>
      </SaveRow>

      <ScenarioList>
        {scenarios.length === 0 && (
          <EmptyMessage>
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
                    onKeyDown={(e) => e.key === "Enter" && handleFinishRename()}
                    onBlur={handleFinishRename}
                    autoFocus
                    maxLength={60}
                    css={{ flex: 1, marginRight: "8px" }}
                  />
                ) : (
                  <ScenarioName>{s.name}</ScenarioName>
                )}
              </CardTop>
              <ScenarioMeta>
                {formatDate(s.createdAt)} · {formatCurrency(parseInt(preview.investmentA) || 0)} ·{" "}
                {preview.returnPct}% · {preview.years}yr
              </ScenarioMeta>
              <CardActions>
                <Button color="green" onClick={() => handleLoad(s)}>
                  Load
                </Button>
                {!isEditing && (
                  <Button color="muted" onClick={() => handleStartRename(s)}>
                    Rename
                  </Button>
                )}
                <Button color="red" onClick={() => handleDelete(s.id)}>
                  Delete
                </Button>
              </CardActions>
            </ScenarioCard>
          );
        })}
      </ScenarioList>
    </Container>
  );
}
