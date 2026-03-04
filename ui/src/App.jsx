import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "http://127.0.0.1:8000";

async function apiAnalyze(path) {
  const res = await fetch(`${API}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path: path }),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

async function apiUpload(file) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 540 }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const drag = useRef({ dragging: false, ox: 0, oy: 0 });
  const [pos, setPos] = useState(null);

  const onMouseDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    drag.current = { dragging: true, ox: e.clientX - rect.left, oy: e.clientY - rect.top };
  };
  const onMouseMove = useCallback((e) => {
    if (!drag.current.dragging) return;
    setPos({ x: e.clientX - drag.current.ox, y: e.clientY - drag.current.oy });
  }, []);
  const onMouseUp = useCallback(() => { drag.current.dragging = false; }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const style = pos
    ? { position: "fixed", left: pos.x, top: pos.y, transform: "none", width }
    : { width };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-window" ref={ref} style={style}>
        <div className="modal-titlebar" onMouseDown={onMouseDown}>
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── ANALYZE DIALOG ───────────────────────────────────────────────────────────
function AnalyzeDialog({ onClose, onResult }) {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function run() {
    if (!path) return;
    setLoading(true); setErr(null);
    try { const r = await apiAnalyze(path); onResult(r); onClose(); }
    catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="Analyze — Open Image or Mountpoint" onClose={onClose} width={600}>
      <div className="dlg-field">
        <label>Path to image / mountpoint</label>
        <input
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="/mnt/snapshot  or  /full/path/to/disk.img"
        />
        <div className="dlg-hint">Use a mounted path for non-pytsk3 environments.</div>
      </div>
      {err && <div className="dlg-error">{err}</div>}
      <div className="dlg-actions">
        <button className="btn-primary" onClick={run} disabled={loading || !path}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// ─── UPLOAD DIALOG ────────────────────────────────────────────────────────────
function UploadDialog({ onClose, onResult }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function run() {
    if (!file) return;
    setLoading(true); setErr(null);
    try { const r = await apiUpload(file); onResult(r); onClose(); }
    catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="Upload Image for Analysis" onClose={onClose} width={520}>
      <div className="dlg-field">
        <label>Select disk image file</label>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <div className="dlg-hint">File is uploaded to the server, analyzed, then deleted automatically.</div>
      </div>
      {file && (
        <div className="dlg-fileinfo">
          Selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </div>
      )}
      {err && <div className="dlg-error">{err}</div>}
      <div className="dlg-actions">
        <button className="btn-primary" onClick={run} disabled={loading || !file}>
          {loading ? "Uploading…" : "Upload & Analyze"}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// ─── REPORT PANEL ─────────────────────────────────────────────────────────────
function ReportPanel({ report, onClose }) {
  if (!report) return null;
  const { os_info, findings, summary } = report;

  function download() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "forensic_report.json"; a.click();
    URL.revokeObjectURL(url);
  }

  const riskColor = {
    high: "#e53e3e", medium: "#d69e2e", low: "#38a169",
    "privacy-infrastructure": "#805ad5", "dual-use": "#3182ce",
  };

  return (
    <Modal title="Forensic Report" onClose={onClose} width={700}>
      <section className="rp-section">
        <h3 className="rp-heading">Operating System</h3>
        <table className="rp-table">
          <tbody>
            <tr><td>Name</td><td><strong>{os_info?.name || "—"}</strong></td></tr>
            <tr><td>ID</td><td>{os_info?.id || "—"}</td></tr>
            <tr><td>Tags</td><td>{os_info?.variant_tags?.join(", ") || "none"}</td></tr>
            {os_info?.notes?.length > 0 && (
              <tr><td>Notes</td><td>{os_info.notes.join("; ")}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rp-section">
        <h3 className="rp-heading">Findings</h3>
        {findings?.length === 0 ? (
          <div className="dlg-hint">No notable tools detected.</div>
        ) : (
          <table className="rp-table findings">
            <thead><tr><th>Tool</th><th>Risk</th><th>Evidence</th></tr></thead>
            <tbody>
              {findings?.map((f, i) => (
                <tr key={i}>
                  <td><strong>{f.tool}</strong></td>
                  <td>
                    <span className="risk-badge"
                      style={{ background: riskColor[f.risk] || "#718096" }}>
                      {f.risk}
                    </span>
                  </td>
                  <td>
                    <ul className="evidence-list">
                      {f.evidence.map((ev, j) => <li key={j}><code>{ev}</code></li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rp-section rp-summary">
        <span>Total tools: <strong>{summary?.total_tools ?? 0}</strong></span>
        <span>High risk: <strong style={{ color: "#e53e3e" }}>{summary?.high_risk ?? 0}</strong></span>
      </section>

      <div className="dlg-actions">
        <button className="btn-primary" onClick={download}>Export JSON</button>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ─── ABOUT DIALOG ─────────────────────────────────────────────────────────────
function AboutDialog({ onClose }) {
  return (
    <Modal title="About OS Forensics" onClose={onClose} width={420}>
      <div className="about-body">
        <div className="about-icon">🔬</div>
        <h2>OS Forensics</h2>
        <p className="about-ver">Prototype — build 0.1.0</p>
        <p>Forensic detection and analysis tool for Linux-based environments. Supports live mounts and raw disk images via pytsk3 (SleuthKit).</p>
        <p className="about-stack">Backend: Python · FastAPI · pytsk3<br />Frontend: React · Vite</p>
      </div>
      <div className="dlg-actions">
        <button className="btn-primary" onClick={onClose}>OK</button>
      </div>
    </Modal>
  );
}

// ─── SETTINGS DIALOG ──────────────────────────────────────────────────────────
function SettingsDialog({ onClose }) {
  return (
    <Modal title="Preferences" onClose={onClose} width={460}>
      <div className="dlg-field">
        <label>API Server URL</label>
        <input defaultValue="http://127.0.0.1:8000" disabled />
        <div className="dlg-hint">Configurable in a future release.</div>
      </div>
      <div className="dlg-field">
        <label>Theme</label>
        <select defaultValue="light">
          <option value="light">Light</option>
          <option value="dark">Dark (coming soon)</option>
        </select>
      </div>
      <div className="dlg-actions">
        <button className="btn-primary" onClick={onClose}>Save</button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// ─── SHORTCUTS DIALOG ─────────────────────────────────────────────────────────
function ShortcutsDialog({ onClose }) {
  const shortcuts = [
    ["Ctrl + O", "Open Analyze dialog"],
    ["Ctrl + U", "Open Upload dialog"],
    ["Ctrl + R", "View last report"],
    ["Ctrl + ,", "Preferences"],
    ["F1", "Help / About"],
    ["Escape", "Close current dialog"],
  ];
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} width={400}>
      <table className="rp-table">
        <thead><tr><th>Key</th><th>Action</th></tr></thead>
        <tbody>
          {shortcuts.map(([k, v]) => (
            <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="dlg-actions">
        <button className="btn-primary" onClick={onClose}>OK</button>
      </div>
    </Modal>
  );
}

// ─── MENU BAR ─────────────────────────────────────────────────────────────────
function MenuBar({ onAction }) {
  const [open, setOpen] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (!barRef.current?.contains(e.target)) setOpen(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const menus = {
    File: [
      { label: "Analyze Image / Mountpoint…", key: "analyze", shortcut: "Ctrl+O" },
      { label: "Upload Image for Analysis…",   key: "upload",  shortcut: "Ctrl+U" },
      { type: "sep" },
      { label: "View Last Report…",            key: "report",  shortcut: "Ctrl+R" },
      { label: "Export Report…",               key: "export" },
      { type: "sep" },
      { label: "Exit",                         key: "exit" },
    ],
    Edit: [
      { label: "Clear Report",   key: "clear" },
      { type: "sep" },
      { label: "Preferences…",  key: "settings", shortcut: "Ctrl+," },
    ],
    View: [
      { label: "Toggle Toolbar",    key: "toolbar" },
      { label: "Toggle Status Bar", key: "statusbar" },
    ],
    Tools: [
      { label: "Analyze Image / Mountpoint…", key: "analyze" },
      { label: "Upload Image for Analysis…",  key: "upload" },
      { type: "sep" },
      { label: "Keyboard Shortcuts…",         key: "shortcuts" },
    ],
    Help: [
      { label: "Keyboard Shortcuts…", key: "shortcuts", shortcut: "F1" },
      { type: "sep" },
      { label: "About OS Forensics…", key: "about" },
    ],
  };

  function pick(key) { setOpen(null); onAction(key); }

  return (
    <nav className="menubar" ref={barRef} role="menubar">
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className={`mb-item ${open === name ? "open" : ""}`}>
          <button
            className="mb-label"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === name}
            onClick={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <ul className="mb-dropdown" role="menu">
              {items.map((item, i) =>
                item.type === "sep" ? (
                  <li key={i} className="mb-sep" role="separator" />
                ) : (
                  <li key={i} className="mb-option" role="menuitem" onClick={() => pick(item.key)}>
                    <span>{item.label}</span>
                    {item.shortcut && <span className="mb-shortcut">{item.shortcut}</span>}
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

// ─── TOOLBAR ──────────────────────────────────────────────────────────────────
function Toolbar({ visible, onAction }) {
  if (!visible) return null;
  const buttons = [
    { icon: "🔍", label: "Analyze", key: "analyze", title: "Analyze (Ctrl+O)" },
    { icon: "📤", label: "Upload",  key: "upload",  title: "Upload (Ctrl+U)" },
    { icon: "📄", label: "Report",  key: "report",  title: "Report (Ctrl+R)" },
    { type: "sep" },
    { icon: "🗑",  label: "Clear",   key: "clear",   title: "Clear report" },
    { type: "sep" },
    { icon: "⚙️", label: "Prefs",   key: "settings", title: "Preferences (Ctrl+,)" },
  ];
  return (
    <div className="toolbar" role="toolbar">
      {buttons.map((b, i) =>
        b.type === "sep" ? (
          <div key={i} className="tb-sep" />
        ) : (
          <button key={i} className="tb-btn" title={b.title} onClick={() => onAction(b.key)}>
            <span className="tb-icon">{b.icon}</span>
            <span className="tb-label">{b.label}</span>
          </button>
        )
      )}
    </div>
  );
}

// ─── STATUS BAR ───────────────────────────────────────────────────────────────
function StatusBar({ visible, status, report }) {
  if (!visible) return null;
  return (
    <div className="statusbar">
      <span className="sb-status">{status}</span>
      {report && (
        <>
          <span className="sb-sep" />
          <span>OS: <strong>{report.os_info?.name || "Unknown"}</strong></span>
          <span className="sb-sep" />
          <span>Findings: <strong>{report.findings?.length ?? 0}</strong></span>
          <span className="sb-sep" />
          <span className={report.summary?.high_risk > 0 ? "sb-high" : "sb-ok"}>
            High Risk: {report.summary?.high_risk ?? 0}
          </span>
        </>
      )}
    </div>
  );
}

// ─── WORKSPACE HOME ───────────────────────────────────────────────────────────
function WorkspaceHome({ onAction }) {
  return (
    <div className="ws-home">
      <div className="ws-logo">🔬</div>
      <h1 className="ws-title">OS Forensics</h1>
      <p className="ws-sub">Forensic detection and analysis for Linux-based environments</p>
      <div className="ws-quickactions">
        <button className="qa-btn" onClick={() => onAction("analyze")}>
          <span className="qa-icon">🔍</span>
          <span className="qa-label">Analyze Image</span>
          <span className="qa-hint">Ctrl+O</span>
        </button>
        <button className="qa-btn" onClick={() => onAction("upload")}>
          <span className="qa-icon">📤</span>
          <span className="qa-label">Upload Image</span>
          <span className="qa-hint">Ctrl+U</span>
        </button>
        <button className="qa-btn" onClick={() => onAction("report")}>
          <span className="qa-icon">📄</span>
          <span className="qa-label">Last Report</span>
          <span className="qa-hint">Ctrl+R</span>
        </button>
      </div>
      <p className="ws-tip">Use the <kbd>File</kbd> menu or toolbar to begin. Press <kbd>F1</kbd> for help.</p>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [dialog, setDialog]     = useState(null);
  const [report, setReport]     = useState(null);
  const [status, setStatus]     = useState("Ready");
  const [toolbar, setToolbar]   = useState(true);
  const [statusbar, setStatusbar] = useState(true);

  function openDialog(key) { setDialog(key); }
  function closeDialog()   { setDialog(null); }

  function handleResult(r) {
    setReport(r);
    setStatus(`Analysis complete — ${r.findings?.length ?? 0} finding(s) detected`);
  }

  function handleAction(key) {
    switch (key) {
      case "analyze":   return openDialog("analyze");
      case "upload":    return openDialog("upload");
      case "report":    return report ? openDialog("report") : setStatus("No report yet — run an analysis first");
      case "export":    return report ? downloadJSON(report) : setStatus("No report to export");
      case "clear":     setReport(null); return setStatus("Report cleared");
      case "settings":  return openDialog("settings");
      case "shortcuts": return openDialog("shortcuts");
      case "about":     return openDialog("about");
      case "statusbar": return setStatusbar((v) => !v);
      case "toolbar":   return setToolbar((v) => !v);
      case "exit":      return setStatus("Close the browser tab to exit.");
      default:          return;
    }
  }

  function downloadJSON(r) {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "forensic_report.json"; a.click();
    URL.revokeObjectURL(url);
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.key === "o") { e.preventDefault(); handleAction("analyze"); }
      if (e.ctrlKey && e.key === "u") { e.preventDefault(); handleAction("upload"); }
      if (e.ctrlKey && e.key === "r") { e.preventDefault(); handleAction("report"); }
      if (e.ctrlKey && e.key === ",") { e.preventDefault(); handleAction("settings"); }
      if (e.key === "F1")             { e.preventDefault(); handleAction("about"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="app-shell">
      <div className="titlebar">
        <span className="title-icon">🔬</span>
        <span className="title-name">OS Forensics</span>
        <span className="title-build">Prototype</span>
      </div>

      <MenuBar onAction={handleAction} />
      <Toolbar visible={toolbar} onAction={handleAction} />

      <div className="workspace">
        <WorkspaceHome onAction={handleAction} />
      </div>

      <StatusBar visible={statusbar} status={status} report={report} />

      {dialog === "analyze"   && <AnalyzeDialog   onClose={closeDialog} onResult={handleResult} />}
      {dialog === "upload"    && <UploadDialog    onClose={closeDialog} onResult={handleResult} />}
      {dialog === "report"    && <ReportPanel     report={report} onClose={closeDialog} />}
      {dialog === "settings"  && <SettingsDialog  onClose={closeDialog} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={closeDialog} />}
      {dialog === "about"     && <AboutDialog     onClose={closeDialog} />}
    </div>
  );
}
