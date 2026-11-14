/**
 * Layout for the MCP settings page. Controls are Harness primitives, and the
 * surface follows the settings-card geometry the Plugins pages use.
 */
export const CSS = `
.mcp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 760px;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}

.mcp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.mcp-scope-menu { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 100%; }
.mcp-scope-trigger { gap: 6px; min-width: 0; max-width: min(320px, 100%); }
.mcp-scope-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-scope-trigger .mcp-scope-count { margin-left: 0; }
.mcp-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-width: 0;
}
.mcp-menu-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-menu-count { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.mcp-add { flex: none; white-space: nowrap; }
.mcp-scope-count {
  margin-left: 6px;
  font-size: 11px;
  line-height: 17px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.mcp-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  flex-wrap: wrap;
  margin-top: -4px;
}
.mcp-scope-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mcp-subactions { display: flex; align-items: center; gap: 2px; margin-left: auto; }

.mcp-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; }

.mcp-card {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
  overflow: hidden;
}
.mcp-card[data-open] { border-color: var(--dsw-alias-border-l3); }
.mcp-card-head { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; }
.mcp-card-ident {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mcp-card-ident:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
.mcp-card-dot { display: inline-flex; padding-top: 5px; flex: none; }
.mcp-card-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.mcp-card-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mcp-card-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcp-card-target {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcp-card-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.mcp-card-meta-part { display: inline-flex; align-items: baseline; gap: 6px; }
.mcp-card-sep { color: var(--dsw-alias-label-dimmed); }
.mcp-card-status { font-weight: 500; color: var(--dsw-alias-label-secondary); }
.mcp-card-status[data-tone='success'] { color: var(--dsw-alias-state-success-primary); }
.mcp-card-status[data-tone='warning'] { color: var(--dsw-alias-state-warn-primary); }
.mcp-card-status[data-tone='error'] { color: var(--dsw-alias-state-error-primary); }
.mcp-card-error {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}
.mcp-card-end { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex: none; }

.mcp-card-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
}
.mcp-card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.mcp-card-foot .mcp-hint { flex: 1 1 220px; }

button.mcp-danger { color: var(--dsw-alias-state-error-primary); }
button.mcp-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
}

.mcp-auth {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-auth-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-auth-note { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.mcp-auth-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-auth-row .mcp-input { flex: 1 1 220px; }
.mcp-input { display: flex; width: 100%; }
.mcp-input:has(input[aria-invalid='true']) { border-color: var(--dsw-alias-state-error-primary); }
.mcp-input:has(input[aria-invalid='true']):focus-within { border-color: var(--dsw-alias-state-error-primary); }

.mcp-error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}
.mcp-error-row span { flex: 1 1 220px; overflow-wrap: anywhere; }

.mcp-detail-body { min-height: 32px; max-height: min(340px, 50vh); overflow-y: auto; border-radius: var(--dsw-radius-sm); }
.mcp-detail-body:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.mcp-items { list-style: none; margin: 0; padding: 0; }
.mcp-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.mcp-item:last-child { border-bottom: none; padding-bottom: 2px; }
.mcp-item-name { font-size: 12px; line-height: 18px; }
.mcp-item-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.mcp-mono { font-family: var(--ds-font-family-code); }
.mcp-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mcp-hint-error { color: var(--dsw-alias-state-error-primary); }
.mcp-muted { margin: 0; color: var(--dsw-alias-label-tertiary); }
.mcp-empty-line { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mcp-filter { display: flex; width: 100%; margin-bottom: 4px; }
.mcp-pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}
.mcp-logs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.mcp-logs time { opacity: 0.75; margin-right: 6px; }
.mcp-log-warn { color: var(--dsw-alias-state-warn-primary); }
.mcp-log-error { color: var(--dsw-alias-state-error-primary); }

.mcp-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: var(--dsw-radius-md);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.mcp-banner span { flex: 1 1 220px; overflow-wrap: anywhere; }

.mcp-hidden-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 2px;
  font-size: 12px;
  line-height: 18px;
}

.mcp-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 20px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.mcp-empty h3 { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.mcp-empty p { margin: 0; max-width: 52ch; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.mcp-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

.mcp-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 15px 14px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.mcp-skeleton-bar {
  height: 12px;
  width: 42%;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-skeleton);
}
.mcp-skeleton-bar + .mcp-skeleton-bar { height: 10px; width: 74%; }

.mcp-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.mcp-foot-label { flex: none; }
.mcp-path { min-width: 0; }
.mcp-visually-hidden {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  width: 1px;
  height: 1px;
  position: absolute;
  overflow: hidden;
  white-space: nowrap;
}

.mcp-modal { max-height: 100%; }
.mcp-modal-content { min-height: 0; overflow-y: auto; }
.mcp-form { display: flex; flex-direction: column; gap: 14px; }
.mcp-form-tools { display: flex; justify-content: flex-start; margin-top: -4px; }
.mcp-form-advanced { display: flex; flex-direction: column; gap: 14px; }
.mcp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.mcp-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.mcp-field-label { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.mcp-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 64px;
  padding: 7px 9px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  resize: vertical;
}
.mcp-textarea:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 1px;
}
.mcp-textarea::placeholder { color: var(--dsw-alias-label-dimmed); }
.mcp-form-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.mcp-modal-name { margin: 0 0 2px; color: var(--dsw-alias-label-primary); font-weight: 500; line-height: 20px; }
.mcp-modal-body { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 20px; }
.mcp-confirm { display: flex; align-items: flex-start; gap: 10px; }
.mcp-confirm > svg { flex: none; margin-top: 2px; color: var(--dsw-alias-state-error-primary); }

@container (max-width: 520px) {
  .mcp-toolbar { align-items: center; flex-wrap: nowrap; }
  .mcp-scope-menu { flex: 1 1 auto; }
  .mcp-scope-trigger { max-width: 100%; }
  .mcp-card-head { flex-wrap: wrap; }
  .mcp-card-end { width: 100%; justify-content: flex-end; }
  .mcp-card-ident { flex: 1 1 240px; }
  .mcp-card-target { white-space: normal; overflow-wrap: anywhere; }
  .mcp-subactions { width: 100%; justify-content: flex-end; }
}

@media (pointer: coarse) {
  .mcp-input input, .mcp-textarea { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .mcp-skeleton-bar { animation: none; }
}

@keyframes mcp-skeleton-pulse {
  0% { opacity: 1; }
  40% { opacity: 0.55; }
  80%, 100% { opacity: 1; }
}
.mcp-skeleton-bar { animation: mcp-skeleton-pulse 2s cubic-bezier(0.36, 0, 0.64, 1) infinite; }
`
