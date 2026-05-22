import { describe, expect, it } from 'vitest';
import { redactSensitiveText, toLogLine, RequestLogger } from './requestLogger';

describe('redactSensitiveText', () => {
  it('redacts token, password, and cookie values', () => {
    const text = 'Token abc123 password=secret Cookie sid=xyz';
    expect(redactSensitiveText(text)).toBe('Token [REDACTED] password=[REDACTED] Cookie [REDACTED]');
  });

  it('redacts JSON password fields and varied whitespace', () => {
    const text = '"password" : "mypw" and password=other';
    expect(redactSensitiveText(text)).toContain('"password":"[REDACTED]"');
    expect(redactSensitiveText(text)).toContain('password=[REDACTED]');
  });

  it('redacts Bearer tokens and Authorization header forms', () => {
    const a = 'Bearer abc123';
    const b = 'Authorization: Bearer abc123';

    expect(redactSensitiveText(a)).not.toContain('abc123');
    expect(redactSensitiveText(b)).not.toContain('abc123');
    expect(redactSensitiveText(b)).toContain('[REDACTED]');
  });

  it('redacts complex Cookie header/value lines', () => {
    const c = 'Cookie: sid=xyz; theme=dark; other=1';
    const out = redactSensitiveText(c);
    expect(out).not.toContain('xyz');
    expect(out).not.toContain('theme=dark');
    expect(out).toContain('Cookie');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts secret-bearing path segments but not plain plural endpoints', () => {
    const a = '/api.php/v1/token/abc123';
    const b = '/api.php/v1/password/secret';
    const c = '/api.php/v1/auth/abc123';
    const d = '/api.php/v1/session/abc123';
    const plural = '/api.php/v1/tokens';

    expect(redactSensitiveText(a)).toContain('/api.php/v1/token/[REDACTED]');
    expect(redactSensitiveText(b)).toContain('/api.php/v1/password/[REDACTED]');
    expect(redactSensitiveText(c)).toContain('/api.php/v1/auth/[REDACTED]');
    expect(redactSensitiveText(d)).toContain('/api.php/v1/session/[REDACTED]');

    // ensure plural endpoint name is not redacted accidentally
    expect(redactSensitiveText(plural)).toBe(plural);
  });

  it('always returns a string even when called with null/undefined at runtime', () => {
    // call with any to simulate unsafe runtime usage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (redactSensitiveText as any)(null)).toBe('string');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (redactSensitiveText as any)(undefined)).toBe('string');
  });

  it('redacts Authorization: Token forms and does not miss Token in header forms', () => {
    const a = 'Authorization: Token abc123';
    const b = 'Token abc123';

    expect(redactSensitiveText(a)).not.toContain('abc123');
    expect(redactSensitiveText(b)).not.toContain('abc123');
    expect(redactSensitiveText(a)).toContain('[REDACTED]');
  });

  it('redacts only the cookie header line and leaves other lines intact', () => {
    const multi = 'Cookie: sid=xyz; theme=dark\nX-Custom: sid=xyz';
    const out = redactSensitiveText(multi);
    // cookie value should be redacted
    expect(out).toContain('Cookie');
    expect(out).toContain('[REDACTED]');
    // other header line must remain unchanged (not swallowed)
    expect(out).toContain('X-Custom: sid=xyz');
  });
});

describe('toLogLine', () => {
  it('formats request metadata without secrets', () => {
    const line = toLogLine({
      method: 'GET',
      path: '/api.php/v1/projects/123',
      status: 200,
      durationMs: 31
    });

    expect(line).toContain('GET /api.php/v1/projects/123 200 31ms');
  });

  it('includes redacted error summary and timestamp', () => {
    const entry = {
      method: 'POST',
      path: '/login',
      status: 500,
      durationMs: 7,
      error: new Error('Token abc123 password=secret cookie sid=zzz "password":"pw"')
    } as const;

    const line = toLogLine(entry as any);
    expect(line).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(line).toContain('POST /login 500 7ms');
    expect(line).not.toContain('abc123');
    expect(line).not.toContain('secret');
    expect(line).not.toContain('zzz');
    expect(line).toContain('[REDACTED]');
  });

  it('redacts secrets present in the path/query when formatting', () => {
    const entry = {
      method: 'GET',
      path: '/api/data?password=secret&token=abc123&other=1',
      status: 200,
      durationMs: 5
    } as const;

    const line = toLogLine(entry as any);
    expect(line).toContain('GET /api/data');
    expect(line).not.toContain('secret');
    expect(line).not.toContain('abc123');
    expect(line).toContain('[REDACTED]');
  });
});

describe('RequestLogger', () => {
  it('writes exactly one formatted line to the channel and show() calls show', () => {
    const appended: string[] = [];
    let showed = false;

    const channel = {
      appendLine: (v: string) => appended.push(v),
      show: () => { showed = true; }
    };

    const logger = new RequestLogger(channel as any);

    logger.log({ method: 'GET', path: '/ok', durationMs: 3, status: 200 });
    expect(appended.length).toBe(1);
    expect(appended[0]).toContain('GET /ok 200 3ms');

    logger.show();
    expect(showed).toBe(true);
  });
});
