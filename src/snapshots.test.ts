import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { extractWindows, parseSnapshot, readProviderUsage } from "./snapshots.ts";

const now = new Date("2026-09-28T04:15:00.000Z");

test("reads currentSession, week and extra weekly windows", () => {
  const windows = extractWindows({
    currentSession: { label: "Current session", usedPct: 6, resetAt: "2026-09-28T08:20:00.000Z" },
    week: { label: "Current week (all models)", usedPct: 76, resetAt: "2026-09-30T23:00:00.000Z" },
    weekFable: { label: "Fable weekly", usedPct: 0 },
    session: { total: 10 },
  });
  assert.deepEqual(
    windows.map((w) => [w.label, w.usedPct]),
    [
      ["Current session", 6],
      ["Current week (all models)", 76],
      ["Fable weekly", 0],
    ],
  );
});

test("prefers windows[] and hides expired percentages", () => {
  const windows = extractWindows({
    week: { usedPct: 99 },
    windows: [{ id: "week", label: "Codex weekly", usedPct: 23, state: "expired" }],
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].usedPct, null);
  assert.equal(windows[0].expired, true);
});

test("marks snapshots older than 30 minutes as stale", () => {
  const fresh = parseSnapshot({ provider: "codex", capturedAt: "2026-09-28T04:10:00.000Z", week: { usedPct: 1 } }, now);
  const old = parseSnapshot({ provider: "codex", capturedAt: "2026-09-28T03:00:00.000Z", week: { usedPct: 1 } }, now);
  assert.equal(fresh?.stale, false);
  assert.equal(old?.stale, true);
});

test("newest file wins and unrelated files are ignored", () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "hud-a-"));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "hud-b-"));
  const write = (dir: string, name: string, body: unknown) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body));
  write(a, "claude-usage.json", { provider: "claude", capturedAt: "2026-09-28T04:00:00Z", week: { usedPct: 10 } });
  write(b, "claude-usage.json", { provider: "claude", capturedAt: "2026-09-28T04:14:00Z", week: { usedPct: 40 } });
  write(a, "codex-account-usage.json", { provider: "codex", week: { usedPct: 5 } });
  write(a, "notes-usage.json", "not json {");
  const result = readProviderUsage([a, b, "/does/not/exist"], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].windows[0].usedPct, 40);
});
