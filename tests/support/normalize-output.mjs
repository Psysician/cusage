const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Output normalization lives in test helpers only, which keeps shipped ANSI
// styling and box drawing intact while goldens stay stable across terminals.
export function normalizeCliOutput(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(ANSI_PATTERN, '')
    .trimEnd();
}
