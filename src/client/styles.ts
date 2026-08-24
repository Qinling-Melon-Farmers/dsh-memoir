/** Stable marker for the stylesheet owned by this client plugin. */
export const PANEL_STYLE_SELECTOR = 'style[data-dsh-memoir-style]'

/**
 * Mount the panel stylesheet without confusing another plugin-owned style tag
 * carrying the same generic data-plugin value for this stylesheet.
 * @param target - document that owns the DSH web shell.
 * @returns disposer that removes only the stylesheet created by this call.
 */
export function mountPanelStyles(target: Document = document): () => void {
  if (target.querySelector(PANEL_STYLE_SELECTOR) !== null) return () => {}
  const tag = target.createElement('style')
  tag.dataset.plugin = 'dsh-memoir'
  tag.dataset.dshMemoirStyle = ''
  tag.textContent = PANEL_CSS
  target.head.appendChild(tag)
  return () => tag.remove()
}

/**
 * Panel stylesheet (plain string, injected as <style data-plugin="dsh-memoir">).
 * Class names are literal memoir-* prefixes (no CSS-module hashing) so the
 * plain-DOM sidebar entry and the React panel share them.
 *
 * The visual language rides the dsh-web-ui family tokens (--dsw-alias-* /
 * --dsw-specific-* / --dsw-font-family). Every token carries a stack fallback
 * (--bg-panel / --text-primary / ...) so the panel still works in a shell
 * without the web-ui-all plugin, while matching dsh-ssh / dsh-task-board /
 * dsh-skill-explorer wherever those tokens exist (light, dark and skins).
 */

export const PANEL_CSS = `
/* --- center-column takeover (mirrors dsh-ssh / dsh-task-board) --------------- */

[data-pane='conversation'],
[class*='centerCol'] {
  position: relative;
}

[data-dsh-memoir-view] {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 60;
  background: var(--dsw-alias-bg-base, var(--bg-panel, #ffffff));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-family: var(--dsw-font-family, inherit);
}

/* The center column is single-occupant; the :not() guards keep the sibling
   panels (task board / ssh) from fighting over visibility. */
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-dsh-memoir-view] {
  display: flex;
  flex-direction: column;
}
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-pane='conversation'] > :not([data-dsh-memoir-view]),
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [class*='centerCol'] > :not([data-dsh-memoir-view]) {
  display: none !important;
}

/* --- panel frame: same shell as dsh-ssh .panel / dsh-task-board .board ------ */

.memoir-panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 10px;
  background: var(--dsw-alias-bg-base, var(--bg-panel, #ffffff));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-family: var(--dsw-font-family, inherit);
  overflow: hidden;
}

.memoir-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 0;
}
.memoir-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  line-height: 1.25;
}
.memoir-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Header icon controls: square ghost icons (dsh-ssh / dsh-task-board iconButton). */
.memoir-header .memoir-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  font-size: 13px;
}
.memoir-header .memoir-iconbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}

/* --- tab bar: dsh-ssh tabBar / tab ------------------------------------------- */

.memoir-tabs {
  display: flex;
  gap: 2px;
  flex: none;
  padding: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
}
.memoir-tab {
  padding: 7px 14px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
}
.memoir-tab:hover {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
.memoir-tab[data-active='true'] {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-weight: 600;
  border-bottom-color: var(--dsw-alias-state-business-primary, #2563eb);
}

/* --- toolbar / controls ------------------------------------------------------- */

.memoir-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
  padding: 0;
}
.memoir-search {
  flex: 0 1 260px;
  min-width: 120px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-search::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .45));
}
.memoir-status-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
  white-space: nowrap;
}
.memoir-status-filter select {
  max-width: 110px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-search:focus,
.memoir-status-filter select:focus {
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}

/* --- buttons: web-ui family button language ---------------------------------- */

.memoir-primary {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  background: var(--dsw-alias-button-info-fill, #2563eb);
  cursor: pointer;
  white-space: nowrap;
}
.memoir-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-info-hover, #1d4ed8);
}
.memoir-primary:disabled {
  opacity: .5;
  cursor: default;
}
.memoir-iconbtn {
  padding: 5px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.memoir-iconbtn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
.memoir-iconbtn:disabled {
  opacity: .45;
  cursor: default;
}

/* --- body / lists ------------------------------------------------------------- */

.memoir-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 16px;
}
.memoir-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-count {
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
}

/* Entry cards: dsh-skill-explorer .skill / dsh-task-board .card surfaces. */
.memoir-entry {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .08));
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--dsw-alias-bg-base, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-entry-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-bottom: 5px;
}
.memoir-chip {
  display: inline-block;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
  background: transparent;
  white-space: nowrap;
}
.memoir-tag {
  color: var(--dsw-alias-state-success-primary, #15803d);
  border-color: var(--dsw-alias-state-success-tertiary, rgba(34, 197, 94, .45));
}
.memoir-score {
  float: right;
  display: inline-block;
  padding: 1px 8px;
  font-size: 10px;
  line-height: 1.6;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-state-business-primary, #2563eb);
  color: var(--dsw-alias-state-business-primary, #2563eb);
  background: transparent;
  opacity: .8;
}
.memoir-entry-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-bottom: 2px;
}
.memoir-entry-content {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  white-space: pre-wrap;
  word-break: break-word;
}
.memoir-entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}
.memoir-delete {
  float: right;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
}
.memoir-delete:hover {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: var(--dsw-alias-state-error-secondary, rgba(220, 38, 38, .12));
}

/* Project cards (global tab + ranked grouped results). */
.memoir-project-card {
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-project-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}
.memoir-project-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-project-path {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .5));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memoir-project-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-bottom: 6px;
}

/* Empty / status / error. */
.memoir-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .5));
}
.memoir-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-bottom: 6px;
}
.memoir-empty-hint {
  font-size: 12px;
}
.memoir-error {
  padding: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}

/* --- forms ------------------------------------------------------------------- */

.memoir-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin: 0;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 10px;
}
.memoir-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.memoir-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.memoir-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #5f6672));
}
.memoir-field small {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .55));
  line-height: 1.35;
}
.memoir-field input,
.memoir-field select,
.memoir-field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-field select {
  height: 30px;
  padding: 0 8px;
}
.memoir-field textarea {
  min-height: 72px;
  resize: vertical;
}
.memoir-field input:focus,
.memoir-field select:focus,
.memoir-field textarea:focus {
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}
.memoir-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* --- settings (panel + Settings page card) ----------------------------------- */

.memoir-settings {
  margin: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary, rgba(0, 0, 0, .1));
  padding-top: 8px;
  flex: none;
}
.memoir-settings-slot {
  list-style: none;
  margin: 0;
  padding: 0 0 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 10px;
  background: var(--dsw-alias-bg-base, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-settings-slot .memoir-settings {
  margin: 12px 14px 0;
  border-top: none;
}
.memoir-settings-slot .memoir-settings-body {
  max-height: none;
}
.memoir-settings-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 7px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
  max-height: min(50vh, 430px);
  overflow-y: auto;
}
.memoir-settings-description,
.memoir-settings-note,
.memoir-settings-source {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  line-height: 1.45;
}
.memoir-settings-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-top: 2px;
}
.memoir-settings-switch {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-settings-switch input {
  margin-top: 3px;
  accent-color: var(--dsw-alias-state-business-primary, #2563eb);
}
.memoir-settings-switch span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.memoir-settings-switch small,
.memoir-settings-grid small {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .55));
  line-height: 1.35;
}
.memoir-settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.memoir-settings-grid .memoir-field {
  min-width: 0;
}
.memoir-settings-grid .memoir-field > span {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
}
.memoir-settings-feedback {
  padding: 0;
}
.memoir-settings-success {
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary, #15803d);
}
@media (max-width: 760px) {
  .memoir-settings-grid {
    grid-template-columns: 1fr;
  }
}

/* --- hot memory inspector / diagnostics -------------------------------------- */

.memoir-inspector,
.memoir-diagnostics {
  margin: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary, rgba(0, 0, 0, .1));
  padding-top: 8px;
  flex: none;
}
.memoir-diagnostics-toggle {
  border: none;
  background: transparent;
  color: var(--dsw-alias-state-business-primary, #2563eb);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 0;
  text-align: left;
}
.memoir-diagnostics-toggle:hover {
  text-decoration: underline;
}
.memoir-inspector-body {
  font-size: 11.5px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin: 6px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  max-height: 220px;
  overflow-y: auto;
}
.memoir-diagnostics-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
}

/* --- sidebar entry row (plain DOM, matches the web-ui family rows) ------------- */

.memoir-entry-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  text-align: left;
}
.memoir-entry-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-specific-sidebar-nav-item-hover, rgba(0, 0, 0, .06)));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-entry-row[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-specific-sidebar-nav-item-active, rgba(0, 0, 0, .08)));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-weight: 600;
}
.memoir-entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}
.memoir-entry-icon svg {
  display: block;
  width: 18px;
  height: 18px;
}
.memoir-entry-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed rail: exact dsh-web-ui-all 0.3.x family geometry. */
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-memoir-entry].memoir-entry-row,
[data-sidebar-collapsed] [data-dsh-memoir-entry].memoir-entry-row {
  border-radius: 50%;
  justify-content: center;
  padding: 0;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
}
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-label,
[data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-label {
  display: none;
}

/* --- focus / motion (web-ui family polish) ------------------------------------ */

.memoir-tab:focus-visible,
.memoir-search:focus-visible,
.memoir-primary:focus-visible,
.memoir-iconbtn:focus-visible,
.memoir-delete:focus-visible,
.memoir-status-filter select:focus-visible,
.memoir-diagnostics-toggle:focus-visible,
.memoir-field input:focus-visible,
.memoir-field select:focus-visible,
.memoir-field textarea:focus-visible,
.memoir-entry-row:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: 2px;
}
.memoir-tab,
.memoir-search,
.memoir-primary,
.memoir-iconbtn,
.memoir-delete,
.memoir-status-filter select,
.memoir-diagnostics-toggle,
.memoir-field input,
.memoir-field select,
.memoir-field textarea,
.memoir-entry-row {
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, outline-color 120ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .memoir-tab,
  .memoir-search,
  .memoir-primary,
  .memoir-iconbtn,
  .memoir-delete,
  .memoir-status-filter select,
  .memoir-diagnostics-toggle,
  .memoir-field input,
  .memoir-field select,
  .memoir-field textarea,
  .memoir-entry-row {
    transition: none;
  }
}

/* Dark fallback only when the dsw tokens are absent (standalone shells);
   with web-ui-all installed the --dsw-alias-* palette already applies. */
body[data-ds-dark-theme] [data-dsh-memoir-view] {
  background: var(--dsw-alias-bg-base, #16181d);
  color: var(--dsw-alias-label-primary, #e6e6e6);
}
`
