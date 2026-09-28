import {
  Action,
  ActionPanel,
  Color,
  getApplications,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  open,
  showInFinder,
} from "@raycast/api";
import { getProgressIcon, usePromise } from "@raycast/utils";
import os from "node:os";
import path from "node:path";
import {
  defaultStateDirectories,
  formatRelative,
  type ProviderUsage,
  readProviderUsage,
  summarize,
  type UsageWindow,
} from "./snapshots";

const STORE_URL = "https://hud.thaliabloom.com/?utm_source=raycast&utm_campaign=mk-002";
const HUD_BUNDLE_ID = "com.codexusagehud.app";

function resolveDirectories(): string[] {
  const { stateDirectory } = getPreferenceValues<{ stateDirectory?: string }>();
  const custom = stateDirectory?.trim();
  if (!custom) return defaultStateDirectories();
  const expanded = custom.startsWith("~") ? path.join(os.homedir(), custom.slice(1)) : custom;
  return [expanded, ...defaultStateDirectories()];
}

async function loadUsage() {
  const directories = resolveDirectories();
  const [providers, apps] = await Promise.all([
    Promise.resolve(readProviderUsage(directories)),
    getApplications().catch(() => []),
  ]);
  const hudInstalled = apps.some((app) => app.bundleId === HUD_BUNDLE_ID);
  return { providers, hudInstalled, stateDirectory: directories[0] };
}

function usageColor(pct: number): Color {
  if (pct >= 90) return Color.Red;
  if (pct >= 70) return Color.Orange;
  return Color.Green;
}

function windowAccessories(window: UsageWindow): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  if (window.resetAt) {
    accessories.push({
      text: `resets ${formatRelative(window.resetAt)}`,
      tooltip: window.resetAt.toLocaleString(),
    });
  }
  accessories.push(
    window.usedPct === null
      ? { tag: { value: window.expired ? "Idle" : "No reading", color: Color.SecondaryText } }
      : { tag: { value: `${Math.round(window.usedPct)}%`, color: usageColor(window.usedPct) } },
  );
  return accessories;
}

function sectionSubtitle(provider: ProviderUsage): string {
  const freshness = provider.capturedAt ? `updated ${formatRelative(provider.capturedAt)}` : "update time unknown";
  return `${provider.confidence} · ${freshness}${provider.stale ? " · stale" : ""}`;
}

export default function Command() {
  const { data, isLoading, revalidate } = usePromise(loadUsage);
  const providers = data?.providers ?? [];

  const getApp = (
    <Action.OpenInBrowser
      title="Get the Usage HUD Menu-Bar App"
      icon={Icon.Download}
      url={STORE_URL}
      shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
    />
  );
  const refresh = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      onAction={revalidate}
      shortcut={Keyboard.Shortcut.Common.Refresh}
    />
  );

  if (!isLoading && providers.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Gauge}
          title={data?.hudInstalled ? "No Usage Readings Yet" : "Usage HUD Isn't Set Up on This Mac"}
          description={
            data?.hudInstalled
              ? "Open Usage HUD and use Claude Code or Codex once. Readings appear here within a minute."
              : "This extension shows the limits that the Usage HUD menu-bar app records for Claude, Codex, and Gemini. Press Enter to get the app ($9, one-time)."
          }
          actions={
            <ActionPanel>
              {data?.hudInstalled ? (
                <Action title="Open Usage HUD" icon={Icon.AppWindow} onAction={() => open(HUD_BUNDLE_ID)} />
              ) : (
                getApp
              )}
              {refresh}
              {data?.hudInstalled ? getApp : null}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter providers and limits">
      {providers.map((provider) => (
        <List.Section key={provider.provider} title={provider.displayName} subtitle={sectionSubtitle(provider)}>
          {provider.windows.map((window) => (
            <List.Item
              key={`${provider.provider}-${window.id}`}
              icon={
                window.usedPct === null
                  ? { source: Icon.Circle, tintColor: Color.SecondaryText }
                  : getProgressIcon(Math.min(window.usedPct, 100) / 100, usageColor(window.usedPct))
              }
              title={window.label}
              keywords={[provider.displayName, provider.provider]}
              accessories={windowAccessories(window)}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.CopyToClipboard title="Copy Usage Summary" content={summarize(providers)} />
                    {refresh}
                    {data?.hudInstalled ? (
                      <Action
                        title="Open Usage HUD"
                        icon={Icon.AppWindow}
                        onAction={() => open(HUD_BUNDLE_ID)}
                        shortcut={Keyboard.Shortcut.Common.Open}
                      />
                    ) : null}
                    {data?.stateDirectory ? (
                      <Action
                        title="Show State Folder in Finder"
                        icon={Icon.Finder}
                        onAction={() => showInFinder(data.stateDirectory)}
                      />
                    ) : null}
                  </ActionPanel.Section>
                  <ActionPanel.Section>{getApp}</ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
