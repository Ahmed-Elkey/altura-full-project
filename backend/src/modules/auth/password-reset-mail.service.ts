import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { buildPasswordResetEmail } from './password-reset-email';

@Injectable()
export class PasswordResetMailService {
  constructor(private readonly config: ConfigService) {}
  assertConfigured() {
    const smtp = this.config.get<string>('MAIL_PROVIDER', 'resend') === 'smtp';
    const ready = smtp
      ? ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].every(key => this.config.get<string>(key)?.trim()) && [465, 587].includes(Number(this.config.get('SMTP_PORT', 465)))
      : Boolean(this.config.get<string>('RESEND_API_KEY')?.trim());
    if (!ready || !this.config.get<string>('PASSWORD_RESET_FROM')?.trim()) {
      throw new ServiceUnavailableException('Password recovery email is unavailable');
    }
  }
  async send(email: string, url: string) {
    this.assertConfigured();
    const { html, text } = buildPasswordResetEmail(url);
    return this.sendMessage(email, { html, text, subject: 'Reset your ALTURA password' });
  }
  async sendMessage(email: string, message: { html: string; text: string; subject: string }) {
    this.assertConfigured();
    const { html, text, subject } = message;
    if (this.config.get<string>('MAIL_PROVIDER', 'resend') === 'smtp') {
      const port = Number(this.config.get('SMTP_PORT', 465));
      const transport = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'), port, secure: port === 465, requireTLS: port === 587,
        auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      });
      try {
        const result = await transport.sendMail({ from: this.config.get<string>('PASSWORD_RESET_FROM'), to: email, subject, text, html });
        if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient not accepted');
      } catch { throw new ServiceUnavailableException('Password recovery email is unavailable'); }
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.config.get<string>('PASSWORD_RESET_FROM'), to: [email], subject, text, html }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Password recovery email is unavailable');
  }
}
