/** Layout for the MCP settings page. Controls are Harness primitives. */

export const CSS = `
.mcp {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 32px;
  max-width: 1080px;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsw-font-size-2, 13px);
}
.mcp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.mcp-head-copy { min-width: 0; }
.mcp-title { margin: 0 0 4px; font-size: var(--dsw-font-size-4, 17px); font-weight: 600; letter-spacing: -0.01em; }
.mcp-lede { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.5; max-width: 62ch; }
.mcp-actions { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
.mcp-muted { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.5; }

.mcp-scopebar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.mcp-scopes { display: flex; gap: 6px; flex-wrap: wrap; }
.mcp-scope-count {
  margin-left: 6px; font-size: var(--dsw-font-size-1, 11px);
  color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums;
}
.mcp-scope-note { color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); }

.mcp-banner {
  margin: 0; padding: 9px 12px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md); color: var(--dsw-alias-label-error);
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-list {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.mcp-row + .mcp-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.mcp-row[data-open] { background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)); }
.mcp-row-main { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; }
.mcp-dot { display: inline-flex; padding-top: 5px; flex: none; }
.mcp-ident {
  flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  border: 0; background: none; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.mcp-ident:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; border-radius: var(--dsw-radius-sm); }
.mcp-name-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mcp-name { font-weight: 600; font-size: var(--dsw-font-size-3, 14px); }
.mcp-target {
  color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px);
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60ch;
}
.mcp-row-end { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; }
.mcp-status { font-size: var(--dsw-font-size-1, 11px); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.mcp-status-done { color: var(--dsw-alias-state-success-primary); }
.mcp-status-warning, .mcp-status-ongoing { color: var(--dsw-alias-state-warn-primary); }
.mcp-status-error { color: var(--dsw-alias-label-error); }

.mcp-details {
  display: flex; flex-direction: column; gap: 12px;
  padding: 2px 14px 14px 34px;
}
.mcp-auth {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
}
.mcp-auth-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-auth-row .mcp-input { flex: 1 1 220px; }
.mcp-auth-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-input { display: flex; width: 100%; }
.mcp-error-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px; border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-error);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}
.mcp-error-row span { flex: 1 1 220px; }

.mcp-detail-body { min-height: 32px; }
.mcp-items { list-style: none; margin: 0; padding: 0; }
.mcp-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.mcp-item:last-child { border-bottom: none; padding-bottom: 2px; }
.mcp-item-name { font-size: var(--dsw-font-size-1, 11px); }
.mcp-item-desc { color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); }
.mcp-mono { font-family: var(--dsw-font-family-mono, ui-monospace, monospace); }
.mcp-hint { color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); line-height: 1.45; }
.mcp-empty-line { margin: 0; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); }
.mcp-pre {
  margin: 0; padding: 10px 12px; max-height: 180px; overflow: auto;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: var(--dsw-font-size-1, 11px);
  white-space: pre-wrap; word-break: break-word;
}
.mcp-logs {
  list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px;
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: var(--dsw-font-size-1, 11px); color: var(--dsw-alias-label-secondary);
}
.mcp-logs time { opacity: 0.75; margin-right: 6px; }
.mcp-log-warn { color: var(--dsw-alias-state-warn-primary); }
.mcp-log-error { color: var(--dsw-alias-label-error); }

.mcp-hidden-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 14px; border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  font-size: var(--dsw-font-size-1, 11px);
}

.mcp-form {
  display: flex; flex-direction: column; gap: 12px; padding: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-form-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.mcp-form-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mcp-form-title h3 { margin: 0; font-size: var(--dsw-font-size-3, 14px); font-weight: 600; }
.mcp-form-tools { display: flex; justify-content: flex-start; }
.mcp-form-advanced { display: flex; flex-direction: column; gap: 12px; }
.mcp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.mcp-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.mcp-field-label { font-size: var(--dsw-font-size-1, 11px); font-weight: 500; color: var(--dsw-alias-label-secondary); }
.mcp-textarea {
  width: 100%; box-sizing: border-box; min-height: 62px; padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l4, var(--dsw-alias-border-l1));
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: var(--dsw-font-size-1, 11px); line-height: 1.45; resize: vertical;
}
.mcp-textarea:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 1px;
}
.mcp-textarea::placeholder { color: var(--dsw-alias-label-dimmed); }
.mcp-form-foot { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.mcp-form-error { margin: 0; color: var(--dsw-alias-label-error); font-size: var(--dsw-font-size-1, 11px); }

.mcp-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 36px 24px; text-align: center;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-empty-icon { color: var(--dsw-alias-label-tertiary); }
.mcp-empty h3 { margin: 0; font-size: var(--dsw-font-size-3, 14px); }
.mcp-empty p { margin: 0; max-width: 46ch; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-size-1, 11px); }
.mcp-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }

.mcp-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-wrap: wrap; color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-size-1, 11px);
}
.mcp-path { min-width: 0; }
.mcp-updated { white-space: nowrap; }
.mcp-modal-body { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.55; }
.mcp-modal-body strong { color: var(--dsw-alias-label-primary); }

@container (max-width: 620px) {
  .mcp-head { flex-direction: column; gap: 12px; }
  .mcp-actions { justify-content: flex-start; }
  .mcp-row-main { flex-wrap: wrap; }
  .mcp-row-end { width: 100%; justify-content: flex-start; margin-left: 20px; }
  .mcp-target { white-space: normal; }
  .mcp-details { padding-left: 20px; }
}
@media (max-width: 720px) {
  .mcp { padding: 16px 14px 28px; }
  .mcp-head { flex-direction: column; gap: 12px; }
  .mcp-row-main { flex-wrap: wrap; }
  .mcp-row-end { width: 100%; justify-content: flex-start; margin-left: 20px; }
  .mcp-target { white-space: normal; }
  .mcp-details { padding-left: 14px; }
}
`
