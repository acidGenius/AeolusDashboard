'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const router = useRouter();
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleIngest() {
    setIngesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      setResult(`+${data.predictions}p / +${data.observations}o / +${data.paperBets}b`);
      router.refresh();
    } catch {
      setResult('error');
    } finally {
      setIngesting(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-[#27272a] bg-[#09090b]/95 px-6 backdrop-blur">
      <div className="flex-1 min-w-0">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-[#71717a] truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {result && (
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-800/50 rounded px-2 py-1">
            {result}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleIngest}
          disabled={ingesting}
          className="gap-1.5 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${ingesting ? 'animate-spin' : ''}`} />
          {ingesting ? 'Syncing…' : 'Sync logs'}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleLogout}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
