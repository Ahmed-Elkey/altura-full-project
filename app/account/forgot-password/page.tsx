import type { Metadata } from 'next';
import { PasswordRecoveryForm } from '@/components/account/PasswordRecoveryForm';
export const metadata: Metadata = { title: 'Forgot password' };
export default function ForgotPasswordPage() { return <PasswordRecoveryForm />; }
