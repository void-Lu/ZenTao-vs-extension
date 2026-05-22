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
  // Ensure we always return a string even when called unsafely at runtime
  if (value == null) return '';

  let out = String(value);

  // Redact JSON "token":"secret" / "Token":"secret" fields.
  out = out.replace(/("token"\s*:\s*")([^"]*)(")/gi, '$1[REDACTED]$3');

  // Redact Token header forms like Token: abc or Token:abc.
  out = out.replace(/\bToken\s*:\s*[^\s,;\r\n]+/gi, 'Token: [REDACTED]');

  // Redact Token <token>
  out = out.replace(/\bToken\s+\S+/gi, 'Token [REDACTED]');

  // Redact Bearer and Authorization: Bearer <token>
  out = out.replace(/\bAuthorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]');
  out = out.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');

  // Redact token= in query/string
  out = out.replace(/\btoken=([^\s;,&]+)/gi, 'token=[REDACTED]');

  // Redact password=secret style
  out = out.replace(/\bpassword=([^\s;,&]+)/gi, 'password=[REDACTED]');

  // Redact JSON "password":"secret" (allow spaces) and normalize spacing to "password":"[REDACTED]"
  out = out.replace(/("password"\s*:\s*")([^"]*)(")/gi, '"password":"[REDACTED]"');

  // Redact Set-Cookie header/value like 'Set-Cookie: sid=xyz; Path=/'
  // Use line-based replacement so we don't consume following lines in multi-line strings
  out = out.replace(/\bSet-Cookie(?:[:\s])[^\r\n]*/gi, 'Set-Cookie [REDACTED]');

  // Redact Cookie header/value like 'Cookie sid=xyz' or 'Cookie: sid=xyz; theme=dark'
  // Replace the entire Cookie header/value line
  // Use line-based replacement so we don't consume following lines in multi-line strings
  // Match Cookie header/value until end-of-line (or end-of-string), case-insensitive
  out = out.replace(/\bCookie(?:[:\s])[^\r\n]*/gi, 'Cookie [REDACTED]');

  // Redact obvious secret-bearing path segments like /token/<secret>, /password/<secret>, /auth/<secret>, /session/<secret>
  // Do not match plural forms like /tokens
  out = out.replace(/\/(token|password|auth|session)\/([^\/\s?#]+)/gi, '/$1/[REDACTED]');

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
    let msg: string;
    if (typeof entry.error === 'string') msg = entry.error;
    else if (entry.error instanceof Error) msg = entry.error.message || String(entry.error);
    else if (entry.error && typeof entry.error === 'object' && typeof (entry.error as { message?: unknown }).message === 'string') {
      msg = (entry.error as { message: string }).message;
    } else {
      msg = String(entry.error ?? '');
    }

    const redacted = redactSensitiveText(msg || '');
    base += ` error: ${redacted}`;
  }

  // Ensure the full line is redacted (path, query, headers may contain secrets)
  return redactSensitiveText(base);
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
