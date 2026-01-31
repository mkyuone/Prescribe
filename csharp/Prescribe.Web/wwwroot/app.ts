type RunMode = "all" | "selection" | "cell";

type Prefs = {
  editorFontSize: number;
  consoleFontSize: number;
  lineWrap: boolean;
  showExecTime: boolean;
  runMode: RunMode;
};

type RunResult = {
  Success: boolean;
  Output: string;
  Error: string;
};

const LS_KEYS = {
  prefs: "prescribe:prefs",
  draft: "prescribe:draft",
  filename: "prescribe:filename",
  runMode: "prescribe:runmode"
};

const DEFAULT_PREFS: Prefs = {
  editorFontSize: 14,
  consoleFontSize: 13.5,
  lineWrap: false,
  showExecTime: true,
  runMode: "all"
};

const SHARE_WARN_LIMIT = 2000;

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};

const dom = {
  runBtn: byId<HTMLButtonElement>("runBtn"),
  runModeBtn: byId<HTMLButtonElement>("runModeBtn"),
  runMenu: byId<HTMLDivElement>("runMenu"),
  runAllBtn: byId<HTMLButtonElement>("runAllBtn"),
  runSelBtn: byId<HTMLButtonElement>("runSelBtn"),
  runCellBtn: byId<HTMLButtonElement>("runCellBtn"),
  runLabel: byId<HTMLSpanElement>("runLabel"),
  openBtn: byId<HTMLButtonElement>("openBtn"),
  saveBtn: byId<HTMLButtonElement>("saveBtn"),
  shareBtn: byId<HTMLButtonElement>("shareBtn"),
  fileInput: byId<HTMLInputElement>("fileInput"),
  moreBtn: byId<HTMLButtonElement>("moreBtn"),
  moreMenu: byId<HTMLDivElement>("moreMenu"),
  clearBtn: byId<HTMLButtonElement>("clearBtn"),
  settingsBtn: byId<HTMLButtonElement>("settingsBtn"),
  aboutBtn: byId<HTMLButtonElement>("aboutBtn"),
  wrapBtn: byId<HTMLButtonElement>("wrapBtn"),
  editorPane: byId<HTMLDivElement>("editorPane"),
  resizer: byId<HTMLDivElement>("dragbar"),
  editor: byId<HTMLTextAreaElement>("editor"),
  consoleEl: byId<HTMLDivElement>("console"),
  clearConsoleBtn: byId<HTMLButtonElement>("clearConsoleBtn"),
  aboutOverlay: byId<HTMLDivElement>("aboutOverlay"),
  closeAboutBtn: byId<HTMLButtonElement>("closeAboutBtn"),
  settingsOverlay: byId<HTMLDivElement>("settingsOverlay"),
  closeSettingsBtn: byId<HTMLButtonElement>("closeSettingsBtn"),
  shareWarnOverlay: byId<HTMLDivElement>("shareWarnOverlay"),
  shareWarnText: byId<HTMLDivElement>("shareWarnText"),
  shareWarnCancelBtn: byId<HTMLButtonElement>("shareWarnCancelBtn"),
  shareWarnDownloadBtn: byId<HTMLButtonElement>("shareWarnDownloadBtn"),
  shareWarnConfirmBtn: byId<HTMLButtonElement>("shareWarnConfirmBtn"),
  shareToast: byId<HTMLDivElement>("shareToast"),
  shareToastTitle: byId<HTMLDivElement>("shareToastTitle"),
  shareToastDesc: byId<HTMLDivElement>("shareToastDesc"),
  shareToastIcon: byId<HTMLSpanElement>("shareToastIcon"),
  fileMeta: byId<HTMLDivElement>("fileMeta"),
  sbRun: byId<HTMLSpanElement>("sbRun"),
  sbDirty: byId<HTMLSpanElement>("sbDirty"),
  sbRuntime: byId<HTMLSpanElement>("sbRuntime"),
  sbFile: byId<HTMLSpanElement>("sbFile"),
  sbPos: byId<HTMLSpanElement>("sbPos"),
  sbSel: byId<HTMLSpanElement>("sbSel"),
  sbClock: byId<HTMLSpanElement>("sbClock"),
  hintRun: byId<HTMLSpanElement>("hintRun"),
  hintOpen: byId<HTMLSpanElement>("hintOpen"),
  hintSave: byId<HTMLSpanElement>("hintSave"),
  hintSettings: byId<HTMLSpanElement>("hintSettings"),
  editorSizeRange: byId<HTMLInputElement>("editorSizeRange"),
  consoleSizeRange: byId<HTMLInputElement>("consoleSizeRange"),
  editorSizeLabel: byId<HTMLSpanElement>("editorSizeLabel"),
  consoleSizeLabel: byId<HTMLSpanElement>("consoleSizeLabel"),
  wrapToggle: byId<HTMLInputElement>("wrapToggle"),
  execTimeToggle: byId<HTMLInputElement>("execTimeToggle"),
  shortcutBody: byId<HTMLTableSectionElement>("shortcutBody"),
  dynamicStyles: byId<HTMLStyleElement>("dynamicStyles"),
  loadingOverlay: byId<HTMLDivElement>("loadingOverlay"),
  stdinInput: byId<HTMLTextAreaElement>("stdinInput")
};

let prefs: Prefs = { ...DEFAULT_PREFS };
let lastSavedContent = dom.editor.value;
let isDirty = false;
let runtimeReady = false;
let sharePendingUrl = "";

function setClass(el: HTMLElement, className: string) {
  el.classList.remove("good", "warn", "bad");
  el.classList.add(className);
}

function debounce(fn: () => void, waitMs: number) {
  let t: number | undefined;
  return () => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(fn, waitMs);
  };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEYS.prefs);
    if (!raw) return;
    prefs = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    prefs = { ...DEFAULT_PREFS };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(LS_KEYS.prefs, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function applyPrefs() {
  dom.dynamicStyles.textContent = `
    .editorArea{ font-size:${prefs.editorFontSize}px; }
    #console{ font-size:${prefs.consoleFontSize}px; }
  `;

  dom.editorSizeRange.value = String(prefs.editorFontSize);
  dom.consoleSizeRange.value = String(prefs.consoleFontSize);
  dom.editorSizeLabel.textContent = `${prefs.editorFontSize.toFixed(2)}px`;
  dom.consoleSizeLabel.textContent = `${prefs.consoleFontSize.toFixed(2)}px`;
  dom.wrapToggle.checked = !!prefs.lineWrap;
  dom.execTimeToggle.checked = !!prefs.showExecTime;
  applyWrapMode();
}

function applyWrapMode() {
  if (prefs.lineWrap) {
    dom.editor.setAttribute("wrap", "soft");
    dom.editor.style.whiteSpace = "pre-wrap";
  } else {
    dom.editor.setAttribute("wrap", "off");
    dom.editor.style.whiteSpace = "pre";
  }
}

function updateStatusBar() {
  dom.sbRun.innerHTML = `<span class="sbDot"></span><strong>${"Ready"}</strong>`;
  setClass(dom.sbRun, "good");

  dom.sbDirty.innerHTML = `<span class="sbDot"></span><strong>${isDirty ? "Unsaved" : "Saved"}</strong>`;
  setClass(dom.sbDirty, isDirty ? "warn" : "good");

  dom.sbRuntime.innerHTML = `<span class="sbDot"></span><strong>${runtimeReady ? "Runtime: ready" : "Runtime: not loaded"}</strong>`;
  setClass(dom.sbRuntime, runtimeReady ? "good" : "bad");
}

function updateClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  dom.sbClock.textContent = `${hh}:${mm}:${ss}`;
}

function updateCursorStatus() {
  const pos = dom.editor.selectionStart;
  const text = dom.editor.value;
  const line = text.slice(0, pos).split("\n").length - 1;
  const col = pos - text.lastIndexOf("\n", pos - 1) - 1;
  dom.sbPos.textContent = `Ln ${line + 1}, Col ${col + 1}`;
  const selLen = Math.abs(dom.editor.selectionEnd - dom.editor.selectionStart);
  dom.sbSel.textContent = `Sel ${selLen}`;
}

function setFilename(name: string) {
  dom.fileMeta.textContent = name;
  dom.sbFile.textContent = name;
  try {
    localStorage.setItem(LS_KEYS.filename, name);
  } catch {
    // ignore
  }
}

function markSaved() {
  lastSavedContent = dom.editor.value;
  isDirty = false;
  updateStatusBar();
}

function setHints() {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "Cmd" : "Ctrl";
  const enterKey = isMac ? "Return" : "Enter";

  dom.hintRun.textContent = `${mod} ${enterKey}`;
  dom.hintOpen.textContent = `${mod} O`;
  dom.hintSave.textContent = `${mod} S`;
  dom.hintSettings.textContent = `${mod} ,`;

  const shortcuts = [
    { keys: [mod, enterKey], desc: "Run (uses Run Mode config)" },
    { keys: [mod, "Shift", enterKey], desc: "Run current cell (# %%)" },
    { keys: [mod, "S"], desc: "Save file" },
    { keys: [mod, "O"], desc: "Open file" },
    { keys: [mod, ","], desc: "Open Settings" },
    { keys: ["Esc"], desc: "Close modals / menus" }
  ];

  dom.shortcutBody.innerHTML = shortcuts
    .map((s) => {
      const keyHtml = s.keys.map((k) => `<kbd>${k}</kbd>`).join("");
      return `<tr><td class="sKeys">${keyHtml}</td><td class="sDesc">${s.desc}</td></tr>`;
    })
    .join("");
}

function showToast(title: string, desc: string, icon = "check_circle") {
  dom.shareToastTitle.textContent = title;
  dom.shareToastDesc.textContent = desc;
  dom.shareToastIcon.textContent = icon;
  dom.shareToast.classList.add("show");
  window.setTimeout(() => dom.shareToast.classList.remove("show"), 2400);
}

function addLine(text: string, opts?: { dim?: boolean; err?: boolean; prefix?: string }) {
  const line = document.createElement("div");
  line.className = "consoleLine";
  if (opts?.dim) line.classList.add("dim");
  if (opts?.err) line.classList.add("err");
  if (opts?.prefix) {
    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.textContent = opts.prefix;
    line.appendChild(prefix);
  }
  line.appendChild(document.createTextNode(text));
  dom.consoleEl.appendChild(line);
  dom.consoleEl.scrollTop = dom.consoleEl.scrollHeight;
}

function clearConsole() {
  dom.consoleEl.innerHTML = "";
}

function openAbout() {
  dom.aboutOverlay.classList.add("active");
}
function closeAbout() {
  dom.aboutOverlay.classList.remove("active");
}
function openSettings() {
  dom.settingsOverlay.classList.add("active");
}
function closeSettings() {
  dom.settingsOverlay.classList.remove("active");
}
function openShareWarn() {
  dom.shareWarnOverlay.classList.add("active");
}
function closeShareWarn() {
  dom.shareWarnOverlay.classList.remove("active");
}
function closeAnyModal() {
  closeAbout();
  closeSettings();
  closeShareWarn();
}

function openMenu() {
  closeRunMenu();
  dom.moreMenu.classList.add("active");
  dom.moreBtn.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  dom.moreMenu.classList.remove("active");
  dom.moreBtn.setAttribute("aria-expanded", "false");
  dom.moreBtn.blur();
}
function toggleMenu() {
  if (dom.moreMenu.classList.contains("active")) closeMenu();
  else openMenu();
}
function openRunMenu() {
  closeMenu();
  dom.runMenu.classList.add("active");
  dom.runModeBtn.setAttribute("aria-expanded", "true");
}
function closeRunMenu() {
  dom.runMenu.classList.remove("active");
  dom.runModeBtn.setAttribute("aria-expanded", "false");
  dom.runModeBtn.blur();
}
function toggleRunMenu() {
  if (dom.runMenu.classList.contains("active")) closeRunMenu();
  else openRunMenu();
}

function getRunModeLabel(mode: RunMode) {
  if (mode === "selection") return "Selection";
  if (mode === "cell") return "Cell";
  return "All";
}

function updateRunModeUI(mode: RunMode) {
  const label = getRunModeLabel(mode);
  dom.runLabel.textContent = `Run ${label}`;
  [dom.runAllBtn, dom.runSelBtn, dom.runCellBtn].forEach((b) => b.classList.remove("activeMode"));
  const map: Record<RunMode, HTMLButtonElement> = {
    all: dom.runAllBtn,
    selection: dom.runSelBtn,
    cell: dom.runCellBtn
  };
  map[mode].classList.add("activeMode");
  dom.runBtn.title = `Run ${label} (Cmd/Ctrl + Enter)`;
}

function setRunMode(mode: RunMode) {
  prefs.runMode = mode;
  savePrefs();
  try {
    localStorage.setItem(LS_KEYS.runMode, mode);
  } catch {
    // ignore
  }
  updateRunModeUI(mode);
  addLine(`Run mode set to: ${getRunModeLabel(mode)}`, { dim: true, prefix: "*" });
}

function getSelectionCode() {
  const start = dom.editor.selectionStart;
  const end = dom.editor.selectionEnd;
  if (start === end) return null;
  return dom.editor.value.slice(start, end);
}

function getCellCode() {
  const text = dom.editor.value;
  const pos = dom.editor.selectionStart;
  const lines = text.split("\n");
  const lineIndex = text.slice(0, pos).split("\n").length - 1;
  let startLine = 0;
  for (let i = lineIndex; i >= 0; i -= 1) {
    if (lines[i].trim().startsWith("# %%")) {
      startLine = i + 1;
      break;
    }
  }
  let endLine = lines.length;
  for (let i = lineIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith("# %%")) {
      endLine = i;
      break;
    }
  }
  return lines.slice(startLine, endLine).join("\n");
}

function getCodeForMode(mode: RunMode): string | null {
  if (mode === "selection") {
    return getSelectionCode();
  }
  if (mode === "cell") {
    return getCellCode();
  }
  return dom.editor.value;
}

async function invokeRun(source: string, input: string): Promise<RunResult> {
  const dotnet = (window as unknown as { DotNet?: { invokeMethodAsync: Function } }).DotNet;
  if (!dotnet || typeof dotnet.invokeMethodAsync !== "function") {
    return { Success: false, Output: "", Error: "Runtime not loaded." };
  }
  const result = await dotnet.invokeMethodAsync("Prescribe.Web", "Run", source, input);
  return result as RunResult;
}

async function runCode(mode: RunMode) {
  if (!runtimeReady) {
    addLine("Runtime not ready yet.", { err: true });
    return;
  }
  const code = getCodeForMode(mode);
  if (!code || !code.trim()) {
    addLine("Nothing to run.", { dim: true });
    return;
  }
  const input = dom.stdinInput.value || "";
  const start = performance.now();
  dom.runBtn.disabled = true;
  dom.runModeBtn.disabled = true;
  dom.sbRun.innerHTML = `<span class="sbDot"></span><strong>Running</strong>`;
  setClass(dom.sbRun, "warn");

  try {
    const result = await invokeRun(code, input);
    if (result.Output) addLine(result.Output.replace(/\n$/, ""));
    if (!result.Success && result.Error) {
      addLine(result.Error, { err: true });
    }
    if (prefs.showExecTime) {
      const ms = performance.now() - start;
      addLine(`Finished in ${ms.toFixed(0)} ms`, { dim: true });
    }
  } catch (err) {
    addLine(String(err), { err: true });
  } finally {
    dom.runBtn.disabled = false;
    dom.runModeBtn.disabled = false;
    dom.sbRun.innerHTML = `<span class="sbDot"></span><strong>Ready</strong>`;
    setClass(dom.sbRun, "good");
  }
}

function saveFile() {
  const name = dom.fileMeta.textContent || "untitled.prsd";
  const blob = new Blob([dom.editor.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markSaved();
}

function openFile() {
  dom.fileInput.value = "";
  dom.fileInput.click();
}

function handleFileOpen(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result ?? "");
    dom.editor.value = content;
    setFilename(file.name || "untitled.prsd");
    markSaved();
    updateCursorStatus();
    try {
      localStorage.setItem(LS_KEYS.draft, content);
    } catch {
      // ignore
    }
  };
  reader.readAsText(file);
}

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function decodeBase64(encoded: string) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildShareUrl(code: string) {
  const base = `${location.origin}${location.pathname}`;
  const payload = encodeURIComponent(encodeBase64(code));
  return `${base}#code=${payload}`;
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

async function shareCode() {
  const url = buildShareUrl(dom.editor.value);
  if (url.length > SHARE_WARN_LIMIT) {
    sharePendingUrl = url;
    dom.shareWarnText.textContent = `This link is ${url.length} characters long. Continue anyway?`;
    openShareWarn();
    return;
  }
  await copyToClipboard(url);
  showToast("Share link copied", "Paste to share this Prescribe session.");
}

function readSharedCodeFromUrl() {
  const hash = location.hash || "";
  if (!hash.startsWith("#code=")) return false;
  const payload = hash.slice("#code=".length);
  if (!payload) return false;
  try {
    const decoded = decodeBase64(decodeURIComponent(payload));
    dom.editor.value = decoded;
    setFilename("shared.prsd");
    markSaved();
    showToast("Shared code loaded", "This editor opened code from a share link.");
    return true;
  } catch {
    addLine("Failed to load shared code from URL.", { err: true });
    return false;
  }
}

function bindGlobalShortcuts() {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        closeAnyModal();
        closeMenu();
        closeRunMenu();
        dom.editor.focus();
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runCode(prefs.runMode);
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        runCode("cell");
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
        return;
      }
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFile();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
    },
    { passive: false }
  );
}

function bindMenuDismiss() {
  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    const withinMore = dom.moreMenu.contains(target) || dom.moreBtn.contains(target);
    if (!withinMore) closeMenu();

    const withinRun = dom.runMenu.contains(target) || dom.runModeBtn.contains(target);
    if (!withinRun) closeRunMenu();
  });
}

function bindModalDismiss() {
  dom.aboutOverlay.addEventListener("click", (e) => {
    if (e.target === dom.aboutOverlay) closeAbout();
  });
  dom.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === dom.settingsOverlay) closeSettings();
  });
  dom.shareWarnOverlay.addEventListener("click", (e) => {
    if (e.target === dom.shareWarnOverlay) closeShareWarn();
  });
}

function bindResizer() {
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  dom.resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = dom.editorPane.offsetHeight;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const split = document.querySelector(".split") as HTMLElement | null;
    if (!split) return;
    const total = split.clientHeight;
    const min = 150;
    const max = total - 150;
    let next = startHeight + dy;
    if (next < min) next = min;
    if (next > max) next = max;
    dom.editorPane.style.height = `${next}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function initRuntimeReady() {
  const poll = () => {
    const dotnet = (window as unknown as { DotNet?: { invokeMethodAsync: Function } }).DotNet;
    if (dotnet && typeof dotnet.invokeMethodAsync === "function") {
      runtimeReady = true;
      updateStatusBar();
      dom.loadingOverlay.classList.add("hidden");
      return;
    }
    window.setTimeout(poll, 100);
  };
  poll();
}

function bindPrefsUI() {
  dom.editorSizeRange.addEventListener("input", () => {
    prefs.editorFontSize = parseFloat(dom.editorSizeRange.value);
    savePrefs();
    applyPrefs();
  });
  dom.consoleSizeRange.addEventListener("input", () => {
    prefs.consoleFontSize = parseFloat(dom.consoleSizeRange.value);
    savePrefs();
    applyPrefs();
  });
  dom.wrapToggle.addEventListener("change", () => {
    prefs.lineWrap = !!dom.wrapToggle.checked;
    savePrefs();
    applyPrefs();
  });
  dom.execTimeToggle.addEventListener("change", () => {
    prefs.showExecTime = !!dom.execTimeToggle.checked;
    savePrefs();
    applyPrefs();
  });
}

function init() {
  loadPrefs();
  applyPrefs();
  setHints();

  const savedName = localStorage.getItem(LS_KEYS.filename);
  if (savedName) setFilename(savedName);

  const restored = readSharedCodeFromUrl();
  if (!restored) {
    const draft = localStorage.getItem(LS_KEYS.draft);
    if (draft) {
      dom.editor.value = draft;
      markSaved();
    }
  }

  const savedMode = localStorage.getItem(LS_KEYS.runMode) as RunMode | null;
  if (savedMode === "selection" || savedMode === "cell" || savedMode === "all") {
    prefs.runMode = savedMode;
  }
  updateRunModeUI(prefs.runMode);

  dom.runBtn.addEventListener("click", () => runCode(prefs.runMode));
  dom.runModeBtn.addEventListener("click", toggleRunMenu);
  dom.runAllBtn.addEventListener("click", () => {
    setRunMode("all");
    closeRunMenu();
  });
  dom.runSelBtn.addEventListener("click", () => {
    setRunMode("selection");
    closeRunMenu();
  });
  dom.runCellBtn.addEventListener("click", () => {
    setRunMode("cell");
    closeRunMenu();
  });

  dom.openBtn.addEventListener("click", openFile);
  dom.saveBtn.addEventListener("click", saveFile);
  dom.shareBtn.addEventListener("click", () => {
    void shareCode();
  });

  dom.moreBtn.addEventListener("click", toggleMenu);
  dom.clearBtn.addEventListener("click", () => {
    closeMenu();
    clearConsole();
  });
  dom.settingsBtn.addEventListener("click", () => {
    closeMenu();
    openSettings();
  });
  dom.aboutBtn.addEventListener("click", () => {
    closeMenu();
    openAbout();
  });

  dom.wrapBtn.addEventListener("click", () => {
    prefs.lineWrap = !prefs.lineWrap;
    savePrefs();
    applyPrefs();
    addLine(`Line wrap: ${prefs.lineWrap ? "on" : "off"}`, { dim: true, prefix: "*" });
  });

  dom.clearConsoleBtn.addEventListener("click", clearConsole);

  dom.closeAboutBtn.addEventListener("click", () => {
    closeAbout();
    dom.editor.focus();
  });
  dom.closeSettingsBtn.addEventListener("click", () => {
    closeSettings();
    dom.editor.focus();
  });

  dom.shareWarnCancelBtn.addEventListener("click", closeShareWarn);
  dom.shareWarnConfirmBtn.addEventListener("click", async () => {
    closeShareWarn();
    if (sharePendingUrl) {
      await copyToClipboard(sharePendingUrl);
      showToast("Share link copied", "Paste to share this Prescribe session.");
    }
  });
  dom.shareWarnDownloadBtn.addEventListener("click", () => {
    closeShareWarn();
    saveFile();
  });

  dom.fileInput.addEventListener("change", () => {
    const file = dom.fileInput.files?.[0];
    if (file) handleFileOpen(file);
  });

  dom.editor.addEventListener("input", () => {
    isDirty = dom.editor.value !== lastSavedContent;
    updateStatusBar();
    try {
      localStorage.setItem(LS_KEYS.draft, dom.editor.value);
    } catch {
      // ignore
    }
  });

  const updateCursorDebounced = debounce(updateCursorStatus, 40);
  dom.editor.addEventListener("keyup", updateCursorDebounced);
  dom.editor.addEventListener("click", updateCursorDebounced);
  dom.editor.addEventListener("select", updateCursorDebounced);
  dom.editor.addEventListener("mouseup", updateCursorDebounced);

  bindPrefsUI();
  bindMenuDismiss();
  bindModalDismiss();
  bindGlobalShortcuts();
  bindResizer();

  updateStatusBar();
  updateCursorStatus();
  updateClock();
  setInterval(updateClock, 1000);
  initRuntimeReady();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
