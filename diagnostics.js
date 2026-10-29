(function installDiagnostics(root) {
  'use strict';
  const entries = [], limit = 2000, startedAt = new Date().toISOString();
  let dropped = 0;
  const redact = text => String(text).replace(/((?:appkey|api_key|token|authorization|password|secret)\s*[=:]\s*)(?:Bearer\s+)?[^\s&"']+/gi, '$1[redacted]');
  function clean(value, depth = 0, seen = new Set()) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object') return redact(value).slice(0, 1500);
    if (seen.has(value)) return '[circular]';
    if (depth > 4) return '[truncated]';
    seen.add(value);
    try {
      if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: redact(value.stack || '').slice(0, 2500) };
      if (Array.isArray(value)) return value.slice(0, 40).map(item => clean(item, depth + 1, seen));
      return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, /key|token|authorization|cookie|password|secret/i.test(key) ? '[redacted]' : clean(item, depth + 1, seen)]));
    } finally { seen.delete(value); }
  }
  function record(event, data) {
    try {
      const sanitized=clean(data), serialized=JSON.stringify(sanitized);
      entries.push({ time: new Date().toISOString(), event, data: serialized?.length>12000 ? { truncated: serialized.slice(0,12000) } : sanitized });
      if (entries.length > limit) { entries.shift(); dropped++; }
    } catch { /* Diagnostics must never interrupt the ride. */ }
  }
  function exportText(context = {}) {
    return JSON.stringify({ app: 'RideMate', formatVersion: 1, startedAt, exportedAt: new Date().toISOString(), userAgent: root.navigator?.userAgent || '', page: root.location?.pathname || '', retained: entries.length, dropped, context: clean(context), entries }, null, 2);
  }
  root.RideMateDiagnostics = { record, exportText };
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'table']) {
    const original = root.console?.[level];
    if (typeof original !== 'function') continue;
    root.console[level] = function (...args) { record('console:' + level, args); return original.apply(this, args); };
  }
  root.addEventListener?.('error', event => record('error', event.error || { message: event.message || 'Resource load failed', file: event.filename || event.target?.src, line: event.lineno, column: event.colno }), true);
  root.addEventListener?.('unhandledrejection', event => record('unhandledrejection', event.reason));
  root.document?.addEventListener('click', event => {
    const element = event.target?.closest?.('button, [data-nav-action], [data-menu-item]');
    if (element) record('click', { id: element.id, action: element.dataset?.navAction || element.dataset?.menuItem, label: element.textContent?.trim().slice(0, 80) });
  }, true);
  if (typeof root.fetch === 'function') {
    const original = root.fetch;
    root.fetch = async function (input, options) {
      let url;
      try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, root.location?.href); } catch { return original.call(this, input, options); }
      if (url.origin !== root.location?.origin || !url.pathname.startsWith('/api/')) return original.call(this, input, options);
      const request = url.pathname + url.search, started = Date.now();
      record('request', { url: request, method: options?.method || input?.method || 'GET' });
      try {
        const response = await original.call(this, input, options);
        record('response', { url: request, status: response.status, durationMs: Date.now() - started });
        return response;
      } catch (error) { record('request-error', { url: request, durationMs: Date.now() - started, error }); throw error; }
    };
  }
  record('app-loaded', { viewport: { width: root.innerWidth, height: root.innerHeight }, online: root.navigator?.onLine });
})(globalThis);
