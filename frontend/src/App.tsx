import { useState } from 'react'
import { ChileMap } from './components/ChileMap'
import { LocationPanel } from './components/LocationPanel'
import { StatsHeader } from './components/StatsHeader'
import type { MapLocation } from './types/api'

function App() {
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(
    null,
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StatsHeader />
      <ChileMap onLocationSelect={setSelectedLocation} />
      <LocationPanel
        location={selectedLocation}
        onClose={() => setSelectedLocation(null)}
      />
    </div>
  )
}

export default App
