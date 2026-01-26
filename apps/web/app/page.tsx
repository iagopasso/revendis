import DashboardLayout from './(dash)/layout';
import DashboardPage from './(dash)/page';

export default function Home({ searchParams }: { searchParams?: Record<string, string | string[]> }) {
  return (
    <DashboardLayout>
      <DashboardPage searchParams={searchParams} />
    </DashboardLayout>
  );
}
