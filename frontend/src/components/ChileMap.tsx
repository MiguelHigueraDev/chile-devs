import type { FeatureCollection } from 'geojson'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { useMapData } from '../api/queries'
import type { MapLocation } from '../types/api'
import {
  CLUSTER_RADIUS,
  DEV_COUNT_COLOR,
  MAP_STYLE,
  ZOOM_SCALED_RADIUS,
} from '@/lib/map-styles'
import { Card, CardContent } from '@/components/ui/card'
import { MapLegend } from './MapLegend'

const CHILE_CENTER: [number, number] = [-71.543, -35.675]
const MAX_ZOOM = 12

const SOURCE_ID = 'locations'
const CLUSTER_LAYER_ID = 'location-clusters'
const CLUSTER_LABEL_LAYER_ID = 'location-cluster-labels'
const POINT_LAYER_ID = 'location-points'
const POINT_LABEL_LAYER_ID = 'location-point-labels'
const INTERACTIVE_LAYERS = [CLUSTER_LAYER_ID, POINT_LAYER_ID] as const

type ChileMapProps = {
  onLocationSelect: (location: MapLocation) => void
}

type MapTooltip = {
  x: number
  y: number
  name: string
  devCount: number
  isCluster: boolean
}

type ClusterChooser = {
  x: number
  y: number
  locations: MapLocation[]
}

function featureToMapLocation(feature: GeoJSON.Feature): MapLocation {
  const props = feature.properties as {
    slug: string
    name: string
    kind: MapLocation['kind']
    devCount: number
    totalContributions: number
  }
  const coordinates =
    feature.geometry.type === 'Point'
      ? (feature.geometry.coordinates as [number, number])
      : CHILE_CENTER

  return {
    slug: props.slug,
    name: props.name,
    kind: props.kind,
    lat: coordinates[1],
    lng: coordinates[0],
    devCount: props.devCount,
    totalContributions: props.totalContributions,
  }
}

function locationsToGeoJson(locations: MapLocation[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((loc) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.lng, loc.lat],
      },
      properties: {
        slug: loc.slug,
        name: loc.name,
        kind: loc.kind,
        devCount: loc.devCount,
        totalContributions: loc.totalContributions,
      },
    })),
  }
}

export function ChileMap({ onLocationSelect }: ChileMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onLocationSelectRef = useRef(onLocationSelect)
  const { data: locations = [], error } = useMapData()
  const [mapReady, setMapReady] = useState(false)
  const [tooltip, setTooltip] = useState<MapTooltip | null>(null)
  const [chooser, setChooser] = useState<ClusterChooser | null>(null)

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect
  }, [onLocationSelect])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: CHILE_CENTER,
      zoom: 4,
      minZoom: 3,
      maxZoom: MAX_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    mapRef.current = map

    map.on('load', () => setMapReady(true))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const geojson = locationsToGeoJson(locations)

    if (map.getSource(SOURCE_ID)) {
      ;(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson)
      return
    }

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: geojson,
      cluster: true,
      // Cluster at every zoom level: regions share exact coordinates with
      // their capital city, so coincident points must never uncluster.
      clusterMaxZoom: MAX_ZOOM,
      clusterRadius: 55,
      clusterProperties: {
        devCount: ['+', ['get', 'devCount']],
        totalContributions: ['+', ['get', 'totalContributions']],
      },
    })

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': CLUSTER_RADIUS,
        'circle-color': DEV_COUNT_COLOR,
        'circle-opacity': 0.65,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.5,
      },
    })

    map.addLayer({
      id: CLUSTER_LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['to-string', ['get', 'devCount']],
        'text-size': 11,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    })

    map.addLayer({
      id: POINT_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ZOOM_SCALED_RADIUS,
        'circle-color': DEV_COUNT_COLOR,
        'circle-opacity': 0.6,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6,
      },
    })

    map.addLayer({
      id: POINT_LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['to-string', ['get', 'devCount']],
        'text-size': 11,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    })

    const handleClusterClick = async (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[]
      },
    ) => {
      const feature = event.features?.[0]
      if (!feature) return

      const clusterId = feature.properties?.cluster_id as number
      const pointCount = feature.properties?.point_count as number
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource
      const coordinates = feature.geometry.type === 'Point'
        ? (feature.geometry.coordinates as [number, number])
        : CHILE_CENTER

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId)

        if (zoom <= MAX_ZOOM) {
          map.easeTo({
            center: coordinates,
            zoom,
            duration: 500,
          })
          return
        }

        // Coincident points (e.g. a region and its capital city share
        // coordinates) can never separate by zooming — let the user pick.
        const leaves = await source.getClusterLeaves(
          clusterId,
          Math.max(pointCount, 10),
          0,
        )
        setTooltip(null)
        setChooser({
          x: event.point.x,
          y: event.point.y,
          locations: leaves.map(featureToMapLocation),
        })
      } catch {
        // Ignore cluster expansion errors
      }
    }

    const handlePointClick = (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[]
      },
    ) => {
      const feature = event.features?.[0]
      if (!feature?.properties) return

      const props = feature.properties
      const coordinates =
        feature.geometry.type === 'Point'
          ? (feature.geometry.coordinates as [number, number])
          : CHILE_CENTER

      onLocationSelectRef.current({
        slug: props.slug as string,
        name: props.name as string,
        kind: props.kind as MapLocation['kind'],
        lat: coordinates[1],
        lng: coordinates[0],
        devCount: props.devCount as number,
        totalContributions: props.totalContributions as number,
      })
    }

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [...INTERACTIVE_LAYERS],
      })
      const feature = features[0]

      if (!feature?.properties) {
        setTooltip(null)
        map.getCanvas().style.cursor = ''
        return
      }

      map.getCanvas().style.cursor = 'pointer'
      const isCluster = Boolean(feature.properties.point_count)
      const devCount = feature.properties.devCount as number

      setTooltip({
        x: event.point.x,
        y: event.point.y,
        name: isCluster
          ? `${feature.properties.point_count} locations`
          : (feature.properties.name as string),
        devCount,
        isCluster,
      })
    }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      setTooltip(null)
    }

    const dismissChooser = () => setChooser(null)

    map.on('click', CLUSTER_LAYER_ID, handleClusterClick)
    map.on('click', POINT_LAYER_ID, handlePointClick)
    map.on('click', dismissChooser)
    map.on('movestart', dismissChooser)
    map.on('mousemove', handleMouseMove)
    map.on('mouseleave', handleMouseLeave)
  }, [locations, mapReady])

  return (
    <div className="relative h-full w-full">
      {error && (
        <Card className="absolute top-4 left-1/2 z-10 -translate-x-1/2 border-destructive/30 bg-destructive/90 py-3 shadow-lg">
          <CardContent className="px-4 py-0 text-sm text-white">
            {error.message}
          </CardContent>
        </Card>
      )}

      <div ref={mapContainerRef} className="h-full w-full" />

      {chooser && (
        <Card className="absolute z-30 w-56 gap-0 overflow-hidden border-border/60 bg-popover/95 py-0 shadow-xl backdrop-blur-md"
          style={{
            left: Math.min(chooser.x + 12, window.innerWidth - 260),
            top: chooser.y + 12,
          }}
        >
          <p className="text-muted-foreground border-b px-3 py-2 text-[10px] font-medium tracking-wider uppercase">
            Locations at this point
          </p>
          <ul className="divide-border divide-y">
            {chooser.locations.map((loc) => (
              <li key={loc.slug}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                  onClick={() => {
                    setChooser(null)
                    onLocationSelectRef.current(loc)
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {loc.name}
                    </span>
                    <span className="text-muted-foreground block text-xs capitalize">
                      {loc.kind}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {loc.devCount.toLocaleString()} devs
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 12,
          }}
        >
          <p className="font-medium">{tooltip.name}</p>
          <p className="text-muted-foreground">
            {tooltip.devCount.toLocaleString()} developers
            {tooltip.isCluster ? ' total' : ''}
          </p>
        </div>
      )}

      <MapLegend />

      {locations.length === 0 && !error && (
        <Card className="pointer-events-none absolute bottom-6 left-1/2 z-10 max-w-sm -translate-x-1/2 border-border/60 bg-card/90 py-4 shadow-lg backdrop-blur-sm">
          <CardContent className="space-y-1 px-5 py-0 text-center">
            <p className="text-sm font-medium">No developer data yet</p>
            <p className="text-muted-foreground text-xs">
              Start the backend and run a sync with your GitHub token.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
