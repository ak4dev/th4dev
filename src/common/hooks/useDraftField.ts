import { useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  numericFieldKeyAction,
  parseFieldValue,
  sanitizeNumericText,
  type NumericFieldPolicy,
} from "../helpers/numeric-field";

/**
 * The draft a number box holds while it has focus: committed on blur or
 * Enter, discarded on Escape.
 *
 * The three boxes that use it spelled this out one at a time and disagreed
 * about every part of it - one committed on blur alone, none of them heard
 * Escape, and each wrote out its own character filter - which is how the same
 * decimal-point bug had to be fixed by hand in three places. What the text
 * means (which characters survive a keystroke, what an unreadable entry is
 * worth, what happens outside the range) is the `policy`, and it lives in
 * numeric-field.ts where it can be tested without a DOM. Only the draft
 * itself lives here.
 */
export function useDraftField({
  display,
  policy,
  commit,
  seed,
}: {
  /** What the box shows when it is not being edited */
  display: string;
  policy: NumericFieldPolicy;
  /** Handed the parsed value; not called at all when the entry reverts */
  commit: (value: number) => void;
  /**
   * The text the draft starts from when the box takes focus. Only a box whose
   * display is FORMATTED needs one: without it the first keystroke would be
   * appended to "$250,000" and the filter would read the result back as a
   * number ten times the size.
   */
  seed?: () => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Writes the draft through. `keepEditing` is Enter rather than blur: the box
   * still has focus, so dropping the draft would put the FORMATTED display
   * back under the caret and the next keystroke would be appended to its
   * punctuation - "$250.000" plus "5" reads back as 250.0005. Holding the
   * committed number instead keeps typing where the user left it.
   */
  const commitDraft = (keepEditing = false) => {
    if (draft === null) return;
    const value = parseFieldValue(draft, policy);
    if (value !== "revert") commit(value);
    setDraft(keepEditing && value !== "revert" ? String(value) : null);
  };

  return {
    value: draft ?? display,
    onFocus: seed && (() => setDraft(seed())),
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setDraft(sanitizeNumericText(e.target.value, policy.decimal)),
    onBlur: () => commitDraft(),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      const action = numericFieldKeyAction(e.key);
      if (action === "commit") commitDraft(true);
      else if (action === "revert") setDraft(null);
    },
  };
}
