import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="ml-56 min-h-screen">{children}</main>
    </div>
  );
}
