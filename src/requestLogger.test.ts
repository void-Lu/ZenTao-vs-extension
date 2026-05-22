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
