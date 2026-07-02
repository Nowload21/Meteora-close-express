// Floating action bar injected at the bottom of the Meteora page.
import type { Settings, TargetToken } from "./settings";

export interface UI {
  busy(msg: string): void;
  done(msg: string): void;
  fail(msg: string): void;
  syncSettings(s: Settings): void;
}

interface MountOpts {
  initialTarget: TargetToken;
  onRun: () => void;
  onTargetChange: (t: TargetToken) => void;
}

const TARGETS: TargetToken[] = ["SOL", "USDC"];

export function mountUI(opts: MountOpts): UI {
  const host = document.createElement("div");
  host.id = "mx-root";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        z-index: 2147483647; display: flex; align-items: center; gap: 10px;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: rgba(20, 22, 30, .92); backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,.12); border-radius: 14px;
        padding: 8px 10px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
      }
      button.run {
        cursor: pointer; border: 0; border-radius: 10px; padding: 10px 18px;
        font-size: 14px; font-weight: 700; color: #08210f;
        background: linear-gradient(135deg,#7cf7a6,#22c55e);
        transition: filter .12s, transform .05s;
      }
      button.run:hover { filter: brightness(1.08); }
      button.run:active { transform: scale(.98); }
      button.run:disabled { opacity: .6; cursor: default; }
      select {
        background: #10131b; color: #e5e7eb; border: 1px solid rgba(255,255,255,.15);
        border-radius: 9px; padding: 8px 10px; font-size: 13px; cursor: pointer;
      }
      .status { font-size: 12px; color: #c7cbd4; min-width: 160px; }
      .status.ok { color: #7cf7a6; font-size: 15px; font-weight: 800; }
      .status.err { color: #fca5a5; }
      .dot { display:inline-block; width:8px;height:8px;border-radius:50%;background:#facc15;margin-right:6px; }
      .dot.ok{background:#22c55e;} .dot.err{background:#ef4444;} .dot.idle{background:#64748b;}
    </style>
    <div class="bar">
      <button class="run" id="run">⚡ Close &amp; Swap</button>
      <select id="target" title="Swap vers"></select>
      <div class="status" id="status"><span class="dot idle"></span>Prêt</div>
    </div>
  `;

  const runBtn = shadow.getElementById("run") as HTMLButtonElement;
  const select = shadow.getElementById("target") as HTMLSelectElement;
  const status = shadow.getElementById("status") as HTMLDivElement;

  for (const t of TARGETS) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = `→ ${t}`;
    if (t === opts.initialTarget) opt.selected = true;
    select.appendChild(opt);
  }

  function setStatus(msg: string, kind: "idle" | "busy" | "ok" | "err") {
    const dotCls = kind === "busy" ? "" : kind;
    status.className = `status ${kind === "ok" ? "ok" : kind === "err" ? "err" : ""}`;
    status.innerHTML = `<span class="dot ${dotCls}"></span>${msg}`;
  }

  runBtn.addEventListener("click", () => opts.onRun());
  select.addEventListener("change", () => opts.onTargetChange(select.value as TargetToken));

  document.documentElement.appendChild(host);

  return {
    busy(msg) {
      runBtn.disabled = true;
      setStatus(msg, "busy");
    },
    done(msg) {
      runBtn.disabled = false;
      setStatus(msg, "ok");
    },
    fail(msg) {
      runBtn.disabled = false;
      setStatus(msg, "err");
    },
    syncSettings(s) {
      if (s.defaultTarget && s.defaultTarget !== (select.value as TargetToken)) {
        select.value = s.defaultTarget;
      }
    },
  };
}
