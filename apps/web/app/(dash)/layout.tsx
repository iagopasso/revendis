import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import Sidebar from './sidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="page">
      <Sidebar
        sessionUser={{
          name: session.user?.name || '',
          email: session.user?.email || ''
        }}
      />
      <div className="content">{children}</div>
    </div>
  );
}
