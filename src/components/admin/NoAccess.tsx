export function NoAccess({ what }: { what: string }) {
  return (
    <div className="max-w-xl rounded-2xl border border-dashed border-champagne bg-cream p-8">
      <h1 className="text-3xl font-medium">No access</h1>
      <p className="mt-2 text-taupe">Your role doesn&apos;t include {what}. Ask a Super Admin if you need it.</p>
    </div>
  );
}

export function NeedsDatabase() {
  return (
    <div className="max-w-xl rounded-2xl border border-dashed border-champagne bg-cream p-8">
      <h1 className="text-3xl font-medium">Database not connected</h1>
      <p className="mt-2 text-taupe">This screen works once Supabase is set up — see docs/SETUP-SUPABASE.md.</p>
    </div>
  );
}
