/**
 * Panel stylesheet (plain string, injected as <style data-plugin="dsh-memoir">).
 * Class names are literal memoir-* prefixes (no CSS-module hashing) so the
 * plain-DOM sidebar entry and the React panel share them. Dark mode follows
 * the shell's body[data-ds-dark-theme] marker via CSS only.
 */

export const PANEL_CSS = `
[data-dsh-memoir-view] {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 20;
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #1f2328);
  font-size: 13px;
}
html[data-dsh-memoir-active] [data-dsh-memoir-view] {
  display: flex;
  flex-direction: column;
}
html[data-dsh-memoir-active] [data-pane="conversation"] > *:not([data-dsh-memoir-view]) {
  display: none;
}

.memoir-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.memoir-header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
.memoir-title { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-subtitle { font-size: 11px; opacity: .65; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-iconbtn {
  border: 1px solid transparent; background: transparent; color: inherit;
  border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
  display: inline-flex; align-items: center; gap: 4px;
}
.memoir-iconbtn:hover { background: var(--bg-hover, rgba(0,0,0,.06)); }

.memoir-tabs { display: flex; gap: 4px; padding: 0 14px; border-bottom: 1px solid var(--border, rgba(0,0,0,.1)); }
.memoir-tab {
  border: none; background: transparent; color: inherit; padding: 7px 12px;
  cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; opacity: .75;
}
.memoir-tab:hover { opacity: 1; }
.memoir-tab[data-active="true"] { opacity: 1; border-bottom-color: var(--accent, #3b82f6); font-weight: 600; }

.memoir-toolbar { display: flex; gap: 8px; padding: 8px 14px; }
.memoir-search {
  flex: 1; border: 1px solid var(--border, rgba(0,0,0,.15)); background: transparent;
  color: inherit; border-radius: 6px; padding: 6px 10px; font-size: 13px; outline: none;
}
.memoir-search:focus { border-color: var(--accent, #3b82f6); }
.memoir-primary {
  border: 1px solid transparent; background: var(--accent, #3b82f6); color: #fff;
  border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;
}
.memoir-primary:hover { filter: brightness(1.05); }

.memoir-body { flex: 1; overflow-y: auto; padding: 4px 14px 16px; }
.memoir-section-title {
  font-size: 12px; font-weight: 600; opacity: .8; margin: 14px 0 6px;
  display: flex; align-items: center; gap: 6px;
}
.memoir-count { font-weight: 400; opacity: .6; }
.memoir-entry {
  border: 1px solid var(--border, rgba(0,0,0,.08)); border-radius: 8px;
  padding: 8px 10px; margin-bottom: 8px; background: var(--bg-card, rgba(0,0,0,.02));
}
.memoir-entry-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .7; margin-bottom: 3px; }
.memoir-chip {
  border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 18px;
  background: var(--chip-bg, rgba(59,130,246,.12)); color: var(--chip-fg, #2563eb);
}
.memoir-entry-title { font-weight: 600; margin-bottom: 2px; }
.memoir-entry-content { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
.memoir-entry-actions { display: flex; gap: 4px; margin: 4px 0; }
.memoir-status-filter { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; white-space: nowrap; }
.memoir-status-filter select { max-width: 110px; }
.memoir-delete {
  float: right; border: none; background: transparent; color: inherit; opacity: .45;
  cursor: pointer; border-radius: 4px; padding: 2px 6px; font-size: 12px;
}
.memoir-delete:hover { opacity: 1; background: var(--danger-bg, rgba(220,38,38,.12)); color: var(--danger, #dc2626); }

.memoir-project-card { border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
.memoir-project-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
.memoir-project-title { font-weight: 600; font-size: 14px; }
.memoir-project-path { font-size: 11px; opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-project-meta { font-size: 11px; opacity: .6; margin-bottom: 6px; }

.memoir-empty { text-align: center; padding: 48px 20px; opacity: .7; }
.memoir-empty-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.memoir-empty-hint { font-size: 12px; }
.memoir-error { color: var(--danger, #dc2626); padding: 8px 14px; font-size: 12px; }

.memoir-form { border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 10px; padding: 12px; margin: 4px 14px 14px; }
.memoir-form-row { display: flex; gap: 8px; margin-bottom: 8px; }
.memoir-field { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.memoir-field label { font-size: 11px; opacity: .7; }
.memoir-field input, .memoir-field select, .memoir-field textarea {
  border: 1px solid var(--border, rgba(0,0,0,.15)); background: transparent; color: inherit;
  border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; outline: none;
}
.memoir-field textarea { min-height: 72px; resize: vertical; }
.memoir-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Sidebar entry row (plain DOM, matches the shell's nav rows). */
.memoir-entry-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 7px 10px; border-radius: 6px; font-size: 13px; text-align: left;
}
.memoir-entry-row:hover { background: var(--bg-hover, rgba(0,0,0,.06)); }
.memoir-entry-row[data-active="true"] { background: var(--bg-hover, rgba(0,0,0,.08)); }
.memoir-entry-icon { display: inline-flex; }

/* The host keeps sidebar rows mounted in its narrow rail. Hide only the
   visible label there; aria-label/title remain available to assistive tech
   and hover users. */
[data-dsh-frame][data-sidebar-collapsed] .memoir-entry-row {
  justify-content: center; gap: 0; padding-inline: 0;
}
[data-dsh-frame][data-sidebar-collapsed] .memoir-entry-label { display: none; }

/* v0.4.2 ranked search */
.memoir-ranked-note { font-size: 11px; opacity: .65; margin: 4px 0 8px; }
.memoir-score {
  float: right; border-radius: 999px; padding: 0 7px; font-size: 10px; line-height: 16px;
  background: var(--chip-bg, rgba(59,130,246,.12)); color: var(--chip-fg, #2563eb); opacity: .8;
}

/* v0.4.2 Hot Memory Inspector */
.memoir-inspector { margin: 0 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 8px; }
.memoir-inspector-body {
  font-size: 11px; opacity: .85; margin: 6px 0 0; padding: 8px 10px;
  border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 8px;
  background: var(--bg-card, rgba(0,0,0,.02)); white-space: pre-wrap; word-break: break-word;
  font-family: inherit; max-height: 220px; overflow-y: auto;
}

body[data-ds-dark-theme] [data-dsh-memoir-view] {
  background: var(--bg-panel, #16181d);
  color: var(--text-primary, #e6e6e6);
}

/* Memory Diagnostics (observability strip, v0.4). */
.memoir-diagnostics { margin: 0 14px 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 8px; }
.memoir-diagnostics-toggle {
  border: none; background: transparent; color: inherit; cursor: pointer;
  font-size: 12px; opacity: .75; padding: 2px 0;
}
.memoir-diagnostics-toggle:hover { opacity: 1; }
.memoir-diagnostics-body { font-size: 11px; opacity: .8; display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
`
