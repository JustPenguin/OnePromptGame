// Clipboard with graceful fallbacks (the artifact iframe may refuse the async Clipboard API). OWNER: Agent E.
/** Copy text: Clipboard API, then execCommand('copy'), then leave the field selected for a manual Ctrl+C. -> 'ok' | 'manual' */
export async function copyText(text, field) {
  try { await navigator.clipboard.writeText(text); return 'ok'; } catch { /* sandboxed iframe or permission denied */ }
  try { field?.focus(); field?.select(); if (document.execCommand('copy')) return 'ok'; } catch { /* ignore */ }
  try { field?.focus(); field?.select(); } catch { /* ignore */ }
  return 'manual';
}
