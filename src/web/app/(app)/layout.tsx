import SideNav from '@/components/SideNav';
import TopBar from '@/components/TopBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <SideNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1400, width: '100%' }}>{children}</main>
      </div>
    </div>
  );
}
