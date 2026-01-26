import type { ReactNode } from 'react';
import Sidebar from './sidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <Sidebar />
      <div className="content">{children}</div>
    </div>
  );
}
