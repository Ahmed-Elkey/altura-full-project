import { ConfigService } from '@nestjs/config';
import { PasswordResetMailService } from './password-reset-mail.service';

describe('PasswordResetMailService', () => {
  afterEach(() => jest.restoreAllMocks());
  const configured = () => new PasswordResetMailService(new ConfigService({ RESEND_API_KEY: 'test-key', PASSWORD_RESET_FROM: 'ALTURA <reset@example.invalid>' }));
  it('requires server configuration before attempting delivery', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    const mail = new PasswordResetMailService(new ConfigService({}));
    await expect(mail.send('qa@example.invalid', 'https://example.invalid/reset')).rejects.toThrow('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('posts a plain text reset link to Resend with server authorization', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    await configured().send('qa@example.invalid', 'https://example.invalid/reset#token=test');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(options?.body as string)).toMatchObject({ to: ['qa@example.invalid'], text: expect.stringContaining('https://example.invalid/reset#token=test'), html: expect.stringContaining('Reset password') });
    expect(options?.signal).toBeDefined();
  });
  it('rejects provider failures without exposing its response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    await expect(configured().send('qa@example.invalid', 'https://example.invalid/reset')).rejects.toThrow('Password recovery email is unavailable');
  });
});
