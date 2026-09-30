/** Placeholder shaped like the app's three panels, shown while the workspace loads. */
export default function AppSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#0f0f0f' }} aria-busy="true" aria-label="Loading workspace">
      <div className="hidden md:flex flex-col gap-3 p-4 border-r" style={{ width: '18%', minWidth: 200, background: '#1a1a1a', borderColor: '#2a2a2a' }}>
        <div className="skeleton h-7 w-28" />
        <div className="skeleton h-8 w-full mt-3" />
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-5" style={{ width: `${85 - i * 8}%` }} />)}
      </div>
      <div className="flex-1 flex flex-col gap-4 p-10">
        <div className="skeleton h-9 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-4/6" />
        <div className="skeleton h-6 w-1/3 mt-6" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
      </div>
      <div className="hidden lg:flex flex-col gap-3 p-4 border-l" style={{ width: '28%', background: '#1a1a1a', borderColor: '#2a2a2a' }}>
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-24 w-full mt-4" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  )
}
