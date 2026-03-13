import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="w-56 bg-gray-900 text-gray-100 p-4 flex flex-col gap-2">
        <h1 className="text-lg font-bold mb-4 px-2">Gaban</h1>
        <Link href="/" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
          Weekly Leads
        </Link>
        <Link href="/history" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
          History
        </Link>
        <Link href="/settings" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
          Settings
        </Link>
        <Link href="/runs" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
          Runs
        </Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
