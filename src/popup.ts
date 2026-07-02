import { DEFAULT_SETTINGS, STORAGE_KEY, type Settings } from "./settings";

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

async function load(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] ?? {}) };
}

function fill(s: Settings) {
  ($("rpcUrl") as HTMLInputElement).value = s.rpcUrl;
  ($("defaultTarget") as HTMLSelectElement).value = s.defaultTarget;
  ($("slippagePct") as HTMLInputElement).value = String(s.slippageBps / 100);
  ($("priorityLevel") as HTMLSelectElement).value = s.priorityLevel;
  ($("maxPrioritySol") as HTMLInputElement).value = String(s.maxPriorityLamports / 1e9);
  ($("skipPreflight") as HTMLInputElement).checked = s.skipPreflight;
}

async function save() {
  const next: Settings = {
    rpcUrl: ($("rpcUrl") as HTMLInputElement).value.trim() || DEFAULT_SETTINGS.rpcUrl,
    defaultTarget: ($("defaultTarget") as HTMLSelectElement).value as Settings["defaultTarget"],
    slippageBps: Math.max(
      10,
      Math.round((Number(($("slippagePct") as HTMLInputElement).value) || 1) * 100)
    ),
    priorityLevel: ($("priorityLevel") as HTMLSelectElement).value as Settings["priorityLevel"],
    maxPriorityLamports: Math.max(
      0,
      Math.round((Number(($("maxPrioritySol") as HTMLInputElement).value) || 0) * 1e9)
    ),
    skipPreflight: ($("skipPreflight") as HTMLInputElement).checked,
  };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  const saved = $("saved");
  saved.textContent = "Enregistré ✓";
  setTimeout(() => (saved.textContent = ""), 1500);
}

load().then(fill);
$("save").addEventListener("click", save);
