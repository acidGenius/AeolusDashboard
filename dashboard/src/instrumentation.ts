export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runIngest } = await import('@/lib/ingest');
    try {
      await runIngest();
      console.log('[ingest] Startup indexing complete');
    } catch (err) {
      console.warn('[ingest] Startup indexing failed:', err);
    }
  }
}
