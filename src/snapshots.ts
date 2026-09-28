import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Snapshots older than this are shown as stale, matching the Usage HUD app. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface UsageWindow {
  id: string;
  label: string;
  usedPct: number | null;
  resetAt: Date | null;
  expired: boolean;
}

export interface ProviderUsage {
  provider: string;
  displayName: string;
  confidence: string;
  confidenceNote: string | null;
  capturedAt: Date | null;
  stale: boolean;
  windows: UsageWindow[];
}

interface RawWindow {
  id?: unknown;
  label?: unknown;
  usedPct?: unknown;
  resetAt?: unknown;
  state?: unknown;
}

type RawSnapshot = Record<string, unknown>;

export function defaultStateDirectories(home: string = os.homedir()): string[] {
  const override = process.env.CODEX_USAGE_HUD_STATE_DIR;
  const dirs = [
    path.join(home, ".codex-usage-hud"),
    path.join(home, ".bloom-usage"),
    path.join(home, "Library", "Application Support", "Bloom Usage HUD", "state"),
  ];
  return override ? [override, ...dirs] : dirs;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWindowLike(value: unknown): value is RawWindow {
  return typeof value === "object" && value !== null && "usedPct" in value;
}

function toWindow(raw: RawWindow, fallbackId: string, fallbackLabel: string): UsageWindow {
  const state = asString(raw.state)?.toLowerCase();
  const expired = state === "expired" || state === "unknown";
  return {
    id: asString(raw.id) ?? fallbackId,
    label: asString(raw.label) ?? fallbackLabel,
    usedPct: expired ? null : asNumber(raw.usedPct),
    resetAt: asDate(raw.resetAt),
    expired,
  };
}

/** Pull limit windows out of one snapshot, in the order the HUD shows them. */
export function extractWindows(snapshot: RawSnapshot): UsageWindow[] {
  if (Array.isArray(snapshot.windows)) {
    return snapshot.windows
      .filter(isWindowLike)
      .map((raw, index) => toWindow(raw, `window-${index}`, `Window ${index + 1}`));
  }
  const windows: UsageWindow[] = [];
  if (isWindowLike(snapshot.currentSession)) {
    windows.push(toWindow(snapshot.currentSession, "currentSession", "Current session"));
  }
  if (isWindowLike(snapshot.week)) {
    windows.push(toWindow(snapshot.week, "week", "Weekly"));
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (key !== "week" && key.startsWith("week") && isWindowLike(value)) {
      windows.push(toWindow(value, key, key));
    }
  }
  return windows;
}

export function parseSnapshot(raw: RawSnapshot, now: Date = new Date()): ProviderUsage | null {
  const provider = asString(raw.provider);
  if (!provider) return null;
  const capturedAt = asDate(raw.capturedAt) ?? asDate(raw.eventAt) ?? asDate(raw.updatedAt);
  return {
    provider: provider.toLowerCase(),
    displayName: asString(raw.displayName) ?? provider.charAt(0).toUpperCase() + provider.slice(1),
    confidence: asString(raw.confidence) ?? "unknown",
    confidenceNote: asString(raw.confidenceNote),
    capturedAt,
    stale: !capturedAt || now.getTime() - capturedAt.getTime() > STALE_AFTER_MS,
    windows: extractWindows(raw),
  };
}

/**
 * Read every `<provider>-usage.json` snapshot. When the same provider appears in
 * more than one folder, the newest reading wins, as it does in the HUD.
 */
export function readProviderUsage(directories: string[], now: Date = new Date()): ProviderUsage[] {
  const byProvider = new Map<string, ProviderUsage>();
  for (const dir of directories) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const match = /^([a-z0-9-]+)-usage\.json$/.exec(name);
      if (!match) continue;
      let parsed: ProviderUsage | null;
      try {
        parsed = parseSnapshot(JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")), now);
      } catch {
        continue;
      }
      // Only files the HUD owns: the provider field must match the file name.
      if (!parsed || parsed.provider !== match[1] || parsed.windows.every((w) => w.usedPct === null)) continue;
      const existing = byProvider.get(parsed.provider);
      const newer = (parsed.capturedAt?.getTime() ?? 0) > (existing?.capturedAt?.getTime() ?? -1);
      if (!existing || newer) byProvider.set(parsed.provider, parsed);
    }
  }
  const order = ["claude", "codex", "gemini"];
  const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
  return [...byProvider.values()].sort(
    (a, b) => rank(a.provider) - rank(b.provider) || a.provider.localeCompare(b.provider),
  );
}

export function formatRelative(target: Date, now: Date = new Date()): string {
  const diffMs = target.getTime() - now.getTime();
  const future = diffMs >= 0;
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  let text: string;
  if (minutes < 1) text = "less than a minute";
  else if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 48 * 60) text = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  else text = `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  return future ? `in ${text}` : `${text} ago`;
}

export function summarize(providers: ProviderUsage[], now: Date = new Date()): string {
  return providers
    .map((p) => {
      const lines = p.windows.map((w) => {
        const pct = w.usedPct === null ? "no current reading" : `${Math.round(w.usedPct)}% used`;
        const reset = w.resetAt ? `, resets ${formatRelative(w.resetAt, now)}` : "";
        return `  ${w.label}: ${pct}${reset}`;
      });
      return [`${p.displayName} (${p.confidence})`, ...lines].join("\n");
    })
    .join("\n");
}
