import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import LoginPanel from './login-panel';

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect('/dashboard');
  }

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const facebookEnabled = Boolean(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET);

  return (
    <main className="auth-page">
      <LoginPanel googleEnabled={googleEnabled} facebookEnabled={facebookEnabled} />
    </main>
  );
}
