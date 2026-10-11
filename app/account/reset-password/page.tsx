import type { Metadata } from 'next';
import { PasswordRecoveryForm } from '@/components/account/PasswordRecoveryForm';
export const metadata: Metadata = { title: 'Reset password', referrer: 'no-referrer' };
export default function ResetPasswordPage() { return <PasswordRecoveryForm reset />; }
