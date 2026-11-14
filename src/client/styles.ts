/** Page styles: host tokens only, prefixed classes. */

export const CSS = `
.mcp-manager {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 24px 32px;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsw-font-size-2, 13px);
  max-width: 1080px;
}
.mcp-manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.mcp-manager-head-copy { min-width: 0; }
.mcp-manager-heading {
  margin: 0 0 4px;
  font-size: var(--dsw-font-size-4, 17px);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary);
}
.mcp-manager-muted {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.5;
  max-width: 62ch;
}
.mcp-manager-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}
.mcp-manager-button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.mcp-manager-button:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.mcp-manager-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.mcp-manager-button:disabled { opacity: 0.55; cursor: default; }
.mcp-manager-primary {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: transparent;
}
.mcp-manager-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
  border-color: var(--dsw-alias-brand-primary);
}
.mcp-manager-icon-button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.mcp-manager-icon-button:hover { background: var(--dsw-alias-bg-layer-2); }
.mcp-manager-icon-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.mcp-manager-tabrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  padding-bottom: 8px;
}
.mcp-manager-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.mcp-manager-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.mcp-manager-tab:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.mcp-manager-tab-active {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1);
}
.mcp-manager-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.mcp-manager-tab-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  line-height: 18px;
  text-align: center;
}
.mcp-manager-scope-hint {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  white-space: nowrap;
}
.mcp-manager-body { display: flex; flex-direction: column; gap: 12px; }
.mcp-manager-banner { margin: 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }
.mcp-manager-table {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.mcp-manager-table-head,
.mcp-manager-row-main {
  display: grid;
  grid-template-columns: minmax(200px, 1.7fr) minmax(90px, auto) 104px 66px minmax(230px, auto);
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
}
.mcp-manager-table-head {
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.mcp-manager-table-head span:nth-child(5) { text-align: right; }
.mcp-manager-list { list-style: none; margin: 0; padding: 0; }
.mcp-manager-row + .mcp-manager-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.mcp-manager-row-main { min-height: 52px; }
.mcp-manager-row-main:hover { background: var(--dsw-alias-bg-layer-2); }
.mcp-manager-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mcp-manager-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  white-space: nowrap;
  justify-self: start;
}
.mcp-manager-status-ready { color: var(--dsw-alias-state-success-primary); }
.mcp-manager-status-error { color: var(--dsw-alias-state-error-primary); }
.mcp-manager-status-needs_auth,
.mcp-manager-status-needs_token { color: var(--dsw-alias-state-warn-primary); }
.mcp-manager-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
  flex: none;
}
.mcp-manager-dot-ready { background: var(--dsw-alias-state-success-primary); }
.mcp-manager-dot-connecting {
  background: var(--dsw-alias-state-warn-primary);
  animation: mcp-manager-pulse 1.4s ease-in-out infinite;
}
.mcp-manager-dot-needs_auth,
.mcp-manager-dot-needs_token { background: var(--dsw-alias-state-warn-primary); }
.mcp-manager-dot-error { background: var(--dsw-alias-state-error-primary); }
.mcp-manager-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcp-manager-target {
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: var(--dsw-font-size-1, 11px);
}
.mcp-manager-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.mcp-manager-badge {
  justify-self: start;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  white-space: nowrap;
}
.mcp-manager-count {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.mcp-manager-row-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 2px 10px;
}
.mcp-manager-link {
  border: none;
  background: none;
  padding: 2px 0;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: var(--dsw-font-size-2, 12px);
  cursor: pointer;
  border-radius: 4px;
}
.mcp-manager-link:hover { color: var(--dsw-alias-label-primary); text-decoration: underline; text-underline-offset: 3px; }
.mcp-manager-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.mcp-manager-link:disabled { opacity: 0.5; cursor: default; }
.mcp-manager-danger { color: var(--dsw-alias-state-error-primary); }
.mcp-manager-details {
  padding: 12px 12px 14px 30px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mcp-manager-label { margin: 6px 0 0; font-weight: 600; font-size: var(--dsw-font-size-2, 12px); }
.mcp-manager-error { color: var(--dsw-alias-state-error-primary); margin: 0; }
.mcp-manager-auth-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-manager-auth-state { margin: 0; color: var(--dsw-alias-label-secondary); }
.mcp-manager-auth-state strong { color: var(--dsw-alias-label-primary); font-weight: 600; }
.mcp-manager-auth-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mcp-manager-tools, .mcp-manager-logs { list-style: none; margin: 0; padding: 0; }
.mcp-manager-tools { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.mcp-manager-tools li {
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: var(--dsw-font-size-1, 11px);
  color: var(--dsw-alias-label-secondary);
}
.mcp-manager-logs { display: flex; flex-direction: column; gap: 2px; font-family: var(--dsw-font-family-mono, ui-monospace, monospace); font-size: var(--dsw-font-size-1, 11px); color: var(--dsw-alias-label-secondary); }
.mcp-manager-log-warn { color: var(--dsw-alias-state-warn-primary); }
.mcp-manager-log-error { color: var(--dsw-alias-state-error-primary); }
.mcp-manager-logs time { color: var(--dsw-alias-label-secondary); opacity: 0.75; }
.mcp-manager-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 24px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 12px;
  text-align: center;
}
.mcp-manager-empty-icon { color: var(--dsw-alias-label-secondary); opacity: 0.7; }
.mcp-manager-empty-title { margin: 0; font-weight: 600; }
.mcp-manager-field-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); line-height: 1.45; }
.mcp-manager-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
}
.mcp-manager-footer code, .mcp-manager-field-hint code {
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  overflow-wrap: anywhere;
}
.mcp-manager-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  animation: mcp-manager-reveal 160ms ease-out;
}
.mcp-manager-editor-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mcp-manager-editor-title { margin: 0; font-size: var(--dsw-font-size-3, 14px); font-weight: 600; }
.mcp-manager-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.mcp-manager-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.mcp-manager-field-label { color: var(--dsw-alias-label-primary); font-size: var(--dsw-font-size-2, 12px); font-weight: 500; }
.mcp-manager-field-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: var(--dsw-font-size-1, 11px); }
.mcp-manager-input, .mcp-manager-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.mcp-manager-input:hover, .mcp-manager-textarea:hover { border-color: var(--dsw-alias-border-l2); }
.mcp-manager-input:focus-visible, .mcp-manager-textarea:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
  border-color: var(--dsw-alias-brand-primary);
}
.mcp-manager-input[aria-invalid="true"] { border-color: var(--dsw-alias-state-error-primary); }
.mcp-manager-input::placeholder, .mcp-manager-textarea::placeholder { color: var(--dsw-alias-label-secondary); opacity: 0.75; }
.mcp-manager-textarea { min-height: 64px; resize: vertical; line-height: 1.45; }
.mcp-manager-mono { font-family: var(--dsw-font-family-mono, ui-monospace, monospace); font-size: var(--dsw-font-size-1, 11px); }
.mcp-manager-segmented {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  width: fit-content;
}
.mcp-manager-segment {
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: var(--dsw-font-size-2, 12px);
  cursor: pointer;
}
.mcp-manager-segment[aria-pressed="true"] {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.mcp-manager-segment:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.mcp-manager-check { display: inline-flex; align-items: center; gap: 8px; font-size: var(--dsw-font-size-2, 12px); }
.mcp-manager-check input { width: 14px; height: 14px; accent-color: var(--dsw-alias-brand-primary); }
.mcp-manager-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
.mcp-manager ::selection { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent); }
@keyframes mcp-manager-reveal {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mcp-manager-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .mcp-manager-editor { animation: none; }
  .mcp-manager-dot-connecting { animation: none; }
  .mcp-manager-button { transition: none; }
}
@media (max-width: 860px) {
  .mcp-manager-head { flex-direction: column; gap: 12px; }
  .mcp-manager-actions { flex-wrap: wrap; }
  .mcp-manager-table-head { display: none; }
  .mcp-manager-row-main {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "identity identity"
      "badges status"
      "count actions";
    row-gap: 8px;
  }
  .mcp-manager-identity { grid-area: identity; }
  .mcp-manager-badges { grid-area: badges; }
  .mcp-manager-status { grid-area: status; justify-self: end; }
  .mcp-manager-count { grid-area: count; align-self: center; }
  .mcp-manager-row-actions { grid-area: actions; justify-content: flex-end; }
  .mcp-manager-tabrow { flex-direction: column; align-items: flex-start; }
  .mcp-manager-scope-hint { white-space: normal; }
  .mcp-manager-details { padding-left: 12px; }
}
`
