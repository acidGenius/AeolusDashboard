'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  async function handleIngest() {
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      setIngestResult(
        `Done — +${data.predictions} predictions, +${data.observations} observations, +${data.paperBets} paper bets`
      );
      router.refresh();
    } catch {
      setIngestResult('Error during ingest');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div>
      <Topbar title="Settings" />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle>Data Indexing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[#71717a]">
              Reads all NDJSON log files from the <code className="font-mono text-cyan-400">../logs/</code> directory and upserts them into the SQLite database.
              Run this after the bot produces new predictions.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="cyan" onClick={handleIngest} disabled={ingesting} className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${ingesting ? 'animate-spin' : ''}`} />
                {ingesting ? 'Syncing…' : 'Sync Logs Now'}
              </Button>
              {ingestResult && (
                <span className="text-xs text-[#71717a]">{ingestResult}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Environment */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-xs">
              {[
                { key: 'DASHBOARD_PASSWORD', desc: 'Dashboard access password' },
                { key: 'JWT_SECRET', desc: 'JWT signing secret (min 32 chars)' },
                { key: 'DATABASE_URL', desc: 'SQLite path, e.g. file:../logs/dashboard.db' },
                { key: 'LOGS_DIR', desc: 'Path to logs/ directory (default: ../logs)' },
              ].map((item) => (
                <div key={item.key} className="flex items-start gap-3 py-2 border-b border-[#27272a]/50">
                  <code className="font-mono text-cyan-400 text-[10px] w-44 shrink-0">{item.key}</code>
                  <span className="text-[#71717a]">{item.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#52525b]">
              Edit <code className="font-mono">.env</code> in the dashboard folder. Restart the server after changes.
            </p>
          </CardContent>
        </Card>

        {/* Auth */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[#71717a] space-y-2">
            <p>Session: httpOnly JWT cookie, 7 day expiry.</p>
            <p>RBAC-ready: JWT payload includes <code className="font-mono text-cyan-400">role: &quot;admin&quot;</code>.</p>
            <p>No external auth providers. Password verified server-side via env var.</p>
          </CardContent>
        </Card>

        {/* Migration */}
        <Card>
          <CardHeader>
            <CardTitle>PostgreSQL Migration</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[#71717a] space-y-2">
            <ol className="list-decimal list-inside space-y-1">
              <li>Change <code className="font-mono text-cyan-400">provider = &quot;postgresql&quot;</code> in <code className="font-mono">prisma/schema.prisma</code></li>
              <li>Update <code className="font-mono text-cyan-400">DATABASE_URL</code> to your PostgreSQL DSN</li>
              <li>Run <code className="font-mono text-cyan-400">npx prisma migrate dev</code></li>
            </ol>
            <p className="text-[10px] text-[#52525b]">All queries are provider-agnostic — no raw SQL with SQLite-specific syntax.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
