import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorDistribution } from '@/components/charts/error-distribution';
import { SpreadAccuracy } from '@/components/charts/spread-accuracy';
import { ConfidenceAccuracy } from '@/components/charts/confidence-accuracy';
import { ModelContribution } from '@/components/charts/model-contribution';
import { fmt } from '@/lib/utils';
import { prisma } from '@/lib/prisma';

async function getData() {
  try {
    const [predictions, observations] = await Promise.all([
      prisma.prediction.findMany({ where: { logFile: 'main' }, orderBy: { targetDate: 'asc' } }),
      prisma.observation.findMany(),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));
    const resolved = predictions.filter((p) => observedMap.has(p.targetDate));

    const argmaxVsConsensus = resolved.map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      const actual = obs.maxTempEra5 ?? obs.maxTemp;
      const actualBand = Math.round(obs.maxTemp);
      const argmax = p.forecastRounded;
      const consensus = p.consensusValue != null ? Math.round(p.consensusValue) : null;
      return {
        date: p.targetDate, argmax, consensus, actual: actualBand,
        argmaxHit: argmax != null ? argmax === actualBand : null,
        consensusHit: consensus != null ? consensus === actualBand : null,
        argmaxErr: argmax != null ? Math.abs(actual - argmax) : null,
        consensusErr: consensus != null && p.consensusValue != null ? Math.abs(actual - p.consensusValue) : null,
      };
    });

    const resolvedCount = argmaxVsConsensus.length;
    const argmaxHits = argmaxVsConsensus.filter((r) => r.argmaxHit === true).length;
    const consensusHits = argmaxVsConsensus.filter((r) => r.consensusHit === true).length;
    const argmaxErrs = argmaxVsConsensus.filter((r) => r.argmaxErr != null).map((r) => r.argmaxErr!);
    const consensusErrs = argmaxVsConsensus.filter((r) => r.consensusErr != null).map((r) => r.consensusErr!);

    const spreadBuckets: Record<string, { hits: number; total: number }> = {
      '0-0.6': { hits: 0, total: 0 }, '0.6-1.2': { hits: 0, total: 0 }, '1.2-2': { hits: 0, total: 0 }, '2+': { hits: 0, total: 0 },
    };
    for (const p of resolved) {
      const obs = observedMap.get(p.targetDate)!;
      const hit = p.forecastRounded != null && Math.round(obs.maxTemp) === p.forecastRounded;
      const key = (p.spread ?? 0) <= 0.6 ? '0-0.6' : (p.spread ?? 0) <= 1.2 ? '0.6-1.2' : (p.spread ?? 0) <= 2 ? '1.2-2' : '2+';
      spreadBuckets[key].total++;
      if (hit) spreadBuckets[key].hits++;
    }

    const confBuckets: Record<string, { hits: number; total: number }> = {
      '0-0.4': { hits: 0, total: 0 }, '0.4-0.6': { hits: 0, total: 0 }, '0.6-0.8': { hits: 0, total: 0 }, '0.8-1': { hits: 0, total: 0 },
    };
    for (const p of resolved) {
      const obs = observedMap.get(p.targetDate)!;
      const hit = p.forecastRounded != null && Math.round(obs.maxTemp) === p.forecastRounded;
      const conf = p.confidence ?? 0;
      const key = conf < 0.4 ? '0-0.4' : conf < 0.6 ? '0.4-0.6' : conf < 0.8 ? '0.6-0.8' : '0.8-1';
      confBuckets[key].total++;
      if (hit) confBuckets[key].hits++;
    }

    const errors = resolved.map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      return (obs.maxTempEra5 ?? obs.maxTemp) - (p.forecastRaw ?? p.forecastRounded ?? 0);
    }).filter(isFinite);
    const errorBins: Record<string, number> = {};
    for (const e of errors) {
      const bin = Math.round(e * 2) / 2;
      const key = `${bin >= 0 ? '+' : ''}${bin.toFixed(1)}`;
      errorBins[key] = (errorBins[key] ?? 0) + 1;
    }

    const modelForecasts = await prisma.modelForecast.findMany({
      where: { prediction: { logFile: 'main' } }, select: { label: true, normalizedWeight: true },
    });
    const contributionMap = new Map<string, number[]>();
    for (const mf of modelForecasts) {
      if (mf.normalizedWeight == null) continue;
      if (!contributionMap.has(mf.label)) contributionMap.set(mf.label, []);
      contributionMap.get(mf.label)!.push(mf.normalizedWeight);
    }

    return {
      argmaxVsConsensus: {
        data: argmaxVsConsensus.slice(-30),
        summary: {
          argmaxAccuracy: resolvedCount ? argmaxHits / resolvedCount : null,
          consensusAccuracy: resolvedCount ? consensusHits / resolvedCount : null,
          argmaxMae: argmaxErrs.length ? argmaxErrs.reduce((a, b) => a + b, 0) / argmaxErrs.length : null,
          consensusMae: consensusErrs.length ? consensusErrs.reduce((a, b) => a + b, 0) / consensusErrs.length : null,
          resolvedCount,
        },
      },
      spreadAccuracy: Object.entries(spreadBuckets).map(([range, d]) => ({ range, accuracy: d.total ? d.hits / d.total : null, count: d.total })),
      confidenceAccuracy: Object.entries(confBuckets).map(([range, d]) => ({ range, winRate: d.total ? d.hits / d.total : null, count: d.total })),
      errorDistribution: Object.entries(errorBins).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([bin, count]) => ({ bin: parseFloat(bin), count })),
      modelContribution: Array.from(contributionMap.entries())
        .map(([label, weights]) => ({ label, avgWeight: weights.reduce((a, b) => a + b, 0) / weights.length }))
        .sort((a, b) => b.avgWeight - a.avgWeight),
    };
  } catch (err) {
    console.error('[research page]', err);
    return null;
  }
}

export default async function ResearchPage() {
  const data = await getData();
  const avc = data?.argmaxVsConsensus ?? { summary: {}, data: [] };
  const summary = avc.summary ?? {};

  return (
    <div>
      <Topbar title="Research" subtitle="Model diagnostics & analytics" />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="argmax">
          <TabsList>
            <TabsTrigger value="argmax">Argmax vs Consensus</TabsTrigger>
            <TabsTrigger value="spread">Spread Analytics</TabsTrigger>
            <TabsTrigger value="confidence">Confidence</TabsTrigger>
            <TabsTrigger value="contribution">Model Contribution</TabsTrigger>
            <TabsTrigger value="errors">Error Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="argmax">
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Argmax Accuracy', value: summary.argmaxAccuracy, color: 'text-cyan-400' },
                  { label: 'Consensus Accuracy', value: summary.consensusAccuracy, color: 'text-purple-400' },
                  { label: 'Argmax MAE', value: summary.argmaxMae, suffix: '°C', color: 'text-[#fafafa]' },
                  { label: 'Consensus MAE', value: summary.consensusMae, suffix: '°C', color: 'text-[#fafafa]' },
                ].map(({ label, value, suffix, color }) => (
                  <div key={label} className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
                    <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1">{label}</p>
                    <p className={`text-2xl font-semibold font-mono ${color}`}>
                      {value != null ? (suffix ? `${fmt(value, 2)}${suffix}` : `${(value * 100).toFixed(1)}%`) : '—'}
                    </p>
                  </div>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Recent: Argmax vs Consensus vs Actual</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#27272a]">
                        {['Date', 'Argmax', 'Consensus', 'Actual', 'Argmax Hit', 'Cons. Hit'].map((h) => (
                          <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-[#52525b] font-medium text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(avc.data ?? []).slice().reverse().map((row: { date: string; argmax: number | null; consensus: number | null; actual: number | null; argmaxHit: boolean | null; consensusHit: boolean | null }) => (
                        <tr key={row.date} className="border-b border-[#27272a]/50 hover:bg-[#18181b]/50">
                          <td className="px-4 py-2 font-mono">{row.date}</td>
                          <td className="px-4 py-2 font-mono text-cyan-400">{row.argmax != null ? `${row.argmax}°C` : '—'}</td>
                          <td className="px-4 py-2 font-mono text-purple-400">{row.consensus != null ? `${row.consensus}°C` : '—'}</td>
                          <td className="px-4 py-2 font-mono font-semibold">{row.actual != null ? `${row.actual}°C` : '—'}</td>
                          <td className="px-4 py-2 text-center">{row.argmaxHit === null ? '—' : row.argmaxHit ? '✓' : '✗'}</td>
                          <td className="px-4 py-2 text-center">{row.consensusHit === null ? '—' : row.consensusHit ? '✓' : '✗'}</td>
                        </tr>
                      ))}
                      {(avc.data ?? []).length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-[#52525b]">No resolved data</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="spread">
            <Card>
              <CardHeader><CardTitle>Spread → Accuracy</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-[#71717a] mb-4">Lower spread = higher model agreement = better hit rate.</p>
                <SpreadAccuracy data={data?.spreadAccuracy ?? []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="confidence">
            <Card>
              <CardHeader><CardTitle>Confidence Score → Win Rate</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-[#71717a] mb-4">Confidence = 1 − spread/5. Shows whether the model is well-calibrated.</p>
                <ConfidenceAccuracy data={data?.confidenceAccuracy ?? []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contribution">
            <Card>
              <CardHeader><CardTitle>Model Contribution (avg normalized weight)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-[#71717a] mb-4">Average weight based on inverse squared historical RMSE. Higher = better performance.</p>
                <ModelContribution data={data?.modelContribution ?? []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors">
            <Card>
              <CardHeader><CardTitle>Error Distribution (actual − forecast, 0.5°C bins)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-[#71717a] mb-4">Positive = actual ran hotter (we under-predict). Negative = actual ran cooler.</p>
                <ErrorDistribution data={data?.errorDistribution ?? []} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
