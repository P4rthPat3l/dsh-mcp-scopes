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
  gap: 8px;
  flex-wrap: wrap;
}
.mcp-search { display: flex; flex: 1 1 200px; min-width: 0; }
.mcp-refresh { flex: none; }
.mcp-scope-menu { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 100%; }
.mcp-scope-trigger { gap: 6px; min-width: 0; max-width: min(240px, 100%); }
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

.mcp-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; }

.mcp-card {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
  overflow: hidden;
}
.mcp-card[data-open] { border-color: var(--dsw-alias-border-l3); }
.mcp-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas: 'ident status end';
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}
.mcp-card-ident {
  grid-area: ident;
  display: flex;
  align-items: flex-start;
  gap: 10px;
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
.mcp-card-ident:hover .mcp-card-name {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.mcp-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.mcp-card-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.mcp-card-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mcp-card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcp-card-target {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcp-card-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 1px; }
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
.mcp-card[data-muted] .mcp-card-name,
.mcp-card[data-muted] .mcp-card-target { color: var(--dsw-alias-label-tertiary); }
.mcp-card[data-muted] .mcp-card-chips { opacity: 0.7; }
.mcp-card-end { grid-area: end; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.mcp-expand { flex: none; gap: 5px; color: var(--dsw-alias-label-secondary); }
.mcp-expand:hover { color: var(--dsw-alias-label-primary); }
.mcp-expand svg { flex: none; }

.mcp-status {
  grid-area: status;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
}
.mcp-status-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; flex: none; }
.mcp-status[data-tone='success'] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}
.mcp-status[data-tone='warning'] {
  color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);
}
.mcp-status[data-tone='error'] {
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
}
.mcp-status[data-tone='muted'] {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
}

.mcp-card-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
}
.mcp-card-details [role='tablist'] { flex-wrap: wrap; }
.mcp-card-details [role='tablist'] button { white-space: nowrap; }
.mcp-card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.mcp-card-foot .mcp-hint { flex: 1 1 220px; }

.mcp-auth {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-auth.mcp-auth-ready {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  flex-wrap: wrap;
}
.mcp-auth-state { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 0; }
.mcp-auth-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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

.mcp-add-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 54px;
  padding: 8px 12px;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xl);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}
.mcp-add-tile:hover { background: var(--dsw-alias-bg-layer-1); }
.mcp-add-tile:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.mcp-add-tile-label { font-size: 13px; font-weight: 500; }
.mcp-add-tile-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; }

.mcp-search-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.mcp-empty {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 20px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.mcp-empty h3 { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.mcp-empty p { margin: 0; max-width: 52ch; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.mcp-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; }

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

.mcp-modal { width: min(460px, calc(100vw - 32px)); max-height: 100%; }
.mcp-modal-content { min-height: 0; overflow-y: auto; }
.mcp-form { display: flex; flex-direction: column; gap: 14px; }
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
.mcp-textarea[aria-invalid='true'] { border-color: var(--dsw-alias-state-error-primary); }
.mcp-command { min-height: 92px; font-family: inherit; }
.mcp-args-count { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }

.mcp-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
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
.mcp-advanced-toggle:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.mcp-advanced-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.mcp-advanced-summary { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.mcp-advanced-toggle svg { flex: none; color: var(--dsw-alias-label-secondary); }

.mcp-pairs { display: flex; flex-direction: column; gap: 6px; }
.mcp-pairs-head { display: flex; align-items: center; gap: 8px; }
.mcp-pairs-title { display: flex; align-items: center; gap: 5px; flex: 1 1 auto; min-width: 0; }
.mcp-pairs-count { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 17px; }
.mcp-pairs-add { display: flex; }
.mcp-pair-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mcp-pair-key { display: flex; flex: 0 1 104px; min-width: 80px; }
.mcp-pair-value { display: flex; flex: 1 1 100px; min-width: 0; }

.mcp-enabled { display: flex; align-items: center; gap: 10px; }
.mcp-enabled-text { display: flex; flex-direction: column; gap: 1px; }
.mcp-enabled-label { font-size: 12px; font-weight: 500; line-height: 18px; }

.mcp-form-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.mcp-modal-name { margin: 0 0 2px; color: var(--dsw-alias-label-primary); font-weight: 500; line-height: 20px; }
.mcp-modal-body { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 20px; }
.mcp-confirm { display: flex; align-items: flex-start; gap: 10px; }
.mcp-confirm > svg { flex: none; margin-top: 2px; color: var(--dsw-alias-state-error-primary); }

@container (max-width: 520px) {
  .mcp-search { flex: 1 1 120px; }
  .mcp-refresh { order: 2; }
  .mcp-scope-menu { order: 3; flex: 1 1 100%; }
  .mcp-scope-trigger { width: 100%; max-width: 100%; }
  .mcp-card-head {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'ident ident'
      'status end';
    align-items: center;
  }
  .mcp-status { justify-self: start; }
  .mcp-card-target { white-space: normal; overflow-wrap: anywhere; }
}

@media (pointer: coarse) {
  .mcp-input input, .mcp-pair-row input, .mcp-textarea { font-size: 16px; }
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
