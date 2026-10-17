export default function GameLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 pt-12 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="h-56 w-40 shrink-0 rounded-2xl bg-surface2 sm:h-64 sm:w-48" />
        <div className="flex-1 space-y-4">
          <div className="h-5 w-40 rounded-full bg-surface2" />
          <div className="h-10 w-2/3 rounded-xl bg-surface2" />
          <div className="h-4 w-64 rounded-full bg-surface2" />
          <div className="h-24 w-full max-w-2xl rounded-xl bg-surface2" />
        </div>
      </div>
      <div className="mt-12 grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 rounded-xl bg-surface2" />
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-7 w-1/3 rounded-lg bg-surface2" />
              <div className="h-4 w-full rounded bg-surface2" />
              <div className="h-4 w-5/6 rounded bg-surface2" />
              <div className="h-4 w-4/6 rounded bg-surface2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
