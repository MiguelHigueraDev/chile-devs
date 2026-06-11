import { useState } from 'react'
import { ChileMap } from './components/ChileMap'
import { LocationPanel } from './components/LocationPanel'
import { StatsHeader } from './components/StatsHeader'
import type { MapLocation } from './types/api'
import { cn } from '@/lib/utils'

function App() {
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(
    null,
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div
        inert={selectedLocation ? true : undefined}
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-[filter] duration-500 ease-in-out motion-reduce:transition-none',
          selectedLocation && 'pointer-events-none blur-[2px] brightness-[0.94]',
        )}
      >
        <StatsHeader />
        <div className="relative min-h-0 flex-1">
          <ChileMap onLocationSelect={setSelectedLocation} />
        </div>
      </div>
      <LocationPanel
        location={selectedLocation}
        onClose={() => setSelectedLocation(null)}
      />
    </div>
  )
}

export default App
