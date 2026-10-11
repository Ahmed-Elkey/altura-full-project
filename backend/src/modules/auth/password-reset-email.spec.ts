import { buildPasswordResetEmail } from './password-reset-email';

describe('password reset email template', () => {
  it('includes the brand, accessible action, expiry and usable plain text fallback', () => {
    const url = 'https://example.invalid/account/reset-password#token=qa-token';
    const result = buildPasswordResetEmail(url);
    expect(result.html).toContain('ALTURA');
    expect(result.html).toContain('Reset your password');
    expect(result.html).toContain('Reset password');
    expect(result.html).toContain('30 minutes');
    expect(result.html).toContain('only once');
    expect(result.html).toContain('If you didn’t request');
    expect(result.html).toContain(`href="${url}"`);
    expect(result.html).toContain('role="presentation"');
    expect(result.text).toContain(url);
    expect(result.text).toContain('30 minutes');
    expect(result.html).not.toContain('<script');
  });
  it('escapes URL characters in HTML attributes and visible text', () => {
    const result = buildPasswordResetEmail('https://example.invalid/reset?a=1&b=2#token=qa');
    expect(result.html).toContain('a=1&amp;b=2');
    expect(result.html).not.toContain('href="https://example.invalid/reset?a=1&b=2');
    expect(result.text).toContain('a=1&b=2');
  });
  it.each(['javascript:alert(1)', 'data:text/html,secret', 'https://user:password@example.invalid/reset'])('rejects unsafe link: %s', url => {
    expect(() => buildPasswordResetEmail(url)).toThrow();
  });
});
