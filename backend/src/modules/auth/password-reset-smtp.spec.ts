import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PasswordResetMailService } from './password-reset-mail.service';
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('SMTP recovery delivery', () => {
  const createTransport = nodemailer.createTransport as jest.Mock;
  const config = (extra = {}) => new ConfigService({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465, SMTP_USER: 'qa@example.invalid', SMTP_PASSWORD: 'unit-test-password', PASSWORD_RESET_FROM: 'ALTURA <qa@example.invalid>', ...extra });
  afterEach(() => jest.resetAllMocks());
  it('sends recovery to the requested recipient over authenticated TLS', async () => {
    const sendMail = jest.fn(async () => ({ accepted: ['customer@example.invalid'], rejected: [] }));
    createTransport.mockReturnValue({ sendMail });
    await new PasswordResetMailService(config()).send('customer@example.invalid', 'https://example.invalid/account/reset-password#token=unit-test');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'qa@example.invalid', pass: 'unit-test-password' }, logger: false, debug: false }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@example.invalid', text: expect.stringContaining('#token=unit-test'), html: expect.stringContaining('Reset password') }));
  });
  it('requires STARTTLS on port 587', async () => {
    createTransport.mockReturnValue({ sendMail: async () => ({ accepted: ['qa@example.invalid'], rejected: [] }) });
    await new PasswordResetMailService(config({ SMTP_PORT: 587 })).send('qa@example.invalid', 'https://example.invalid/reset');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  });
  it('requires complete SMTP configuration before delivery', async () => {
    await expect(new PasswordResetMailService(config({ SMTP_PASSWORD: '' })).send('qa@example.invalid', 'https://example.invalid/reset')).rejects.toThrow('unavailable');
    expect(createTransport).not.toHaveBeenCalled();
  });
  it('sanitizes authentication errors', async () => {
    createTransport.mockReturnValue({ sendMail: async () => { throw Error('private provider credentials'); } });
    await expect(new PasswordResetMailService(config()).send('qa@example.invalid', 'https://example.invalid/reset')).rejects.toThrow('Password recovery email is unavailable');
  });
  it('rejects an SMTP result without recipient acceptance', async () => {
    createTransport.mockReturnValue({ sendMail: async () => ({ accepted: [], rejected: ['qa@example.invalid'] }) });
    await expect(new PasswordResetMailService(config()).send('qa@example.invalid', 'https://example.invalid/reset')).rejects.toThrow('unavailable');
  });
});
