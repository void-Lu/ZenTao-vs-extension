export interface RequestLogEntry {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  error?: unknown;
}

export interface OutputChannelLike {
  appendLine(value: string): void;
  show(): void;
}

export function redactSensitiveText(value: string): string {
  if (!value) return value;

  let out = value;

  // Redact Token <token>
  out = out.replace(/\bToken\s+\S+/gi, 'Token [REDACTED]');

  // Redact password=secret style
  out = out.replace(/\bpassword=([^\s;,&]+)/gi, 'password=[REDACTED]');

  // Redact JSON "password":"secret" (allow spaces) and normalize spacing to "password":"[REDACTED]"
  out = out.replace(/("password"\s*:\s*")([^"]*)(")/gi, '"password":"[REDACTED]"');

  // Redact Cookie header/value like 'Cookie sid=xyz' or 'Cookie: sid=xyz;'
  out = out.replace(/\bCookie[:\s]+[^;\s]+(?:=[^;\s]+)?/gi, 'Cookie [REDACTED]');

  return out;
}

export function toLogLine(entry: RequestLogEntry): string {
  const ts = new Date().toISOString();
  const method = entry.method;
  const path = entry.path;
  const status = entry.status ?? '-';
  const duration = `${entry.durationMs}ms`;

  let base = `${ts} ${method} ${path} ${status} ${duration}`;

  if (entry.error) {
    // Attempt to get message
    let msg: string;
    if (typeof entry.error === 'string') msg = entry.error;
    else if (entry.error instanceof Error) msg = entry.error.message || String(entry.error);
    else {
      try { msg = JSON.stringify(entry.error); } catch { msg = String(entry.error); }
    }

    const redacted = redactSensitiveText(msg || '');
    base += ` error: ${redacted}`;
  }

  return base;
}

export class RequestLogger {
  private channel: OutputChannelLike;

  constructor(channel: OutputChannelLike) {
    this.channel = channel;
  }

  log(entry: RequestLogEntry) {
    const line = toLogLine(entry);
    this.channel.appendLine(line);
  }

  show() {
    this.channel.show();
  }
}

export default RequestLogger;
