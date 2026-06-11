import type { FeatureCollection, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchLocationDevelopers, fetchMapData } from '../api/client';
import type { DeveloperSummary, MapLocation } from '../types/api';
import { LocationPopup } from './LocationPopup';

const CHILE_CENTER: [number, number] = [-71.543, -35.675];
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function devCountToRadius(count: number): number {
  return Math.min(8 + Math.sqrt(count) * 3, 40);
}

function devCountToColor(count: number): string {
  if (count >= 100) return '#ef4444';
  if (count >= 50) return '#f97316';
  if (count >= 20) return '#eab308';
  if (count >= 5) return '#22c55e';
  return '#38bdf8';
}

export function ChileMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMapData()
      .then(setLocations)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: CHILE_CENTER,
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => setMapReady(true));

    return () => {
      popupRootRef.current?.unmount();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const sourceId = 'locations';
    const layerId = 'location-circles';
    const labelLayerId = 'location-labels';

    const geojson: FeatureCollection = {
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
          radius: devCountToRadius(loc.devCount),
          color: devCountToColor(loc.devCount),
        },
      })),
    };

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
      return;
    }

    map.addSource(sourceId, { type: 'geojson', data: geojson });

    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.75,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.9,
      },
    });

    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
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
    });

    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });

    map.on('click', layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const props = feature.properties as {
        slug: string;
        name: string;
        devCount: number;
        totalContributions: number;
      };

      const coordinates = (feature.geometry as Point).coordinates.slice() as [
        number,
        number,
      ];

      while (Math.abs(event.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += event.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      popupRootRef.current?.unmount();
      popupRef.current?.remove();

      const container = document.createElement('div');
      const root = createRoot(container);
      popupRootRef.current = root;

      root.render(
        <LocationPopup
          locationName={props.name}
          devCount={props.devCount}
          totalContributions={props.totalContributions}
          developers={[]}
          loading={true}
          error={null}
        />,
      );

      const popup = new maplibregl.Popup({
        offset: 16,
        maxWidth: '320px',
        closeButton: true,
      })
        .setLngLat(coordinates)
        .setDOMContent(container)
        .addTo(map);

      popupRef.current = popup;

      popup.on('close', () => {
        root.unmount();
        popupRootRef.current = null;
      });

      fetchLocationDevelopers(props.slug)
        .then((data) => {
          root.render(
            <LocationPopup
              locationName={data.location.name}
              devCount={data.devCount}
              totalContributions={data.totalContributions}
              developers={data.developers}
              loading={false}
              error={null}
            />,
          );
        })
        .catch((err: Error) => {
          root.render(
            <LocationPopup
              locationName={props.name}
              devCount={props.devCount}
              totalContributions={props.totalContributions}
              developers={[] as DeveloperSummary[]}
              loading={false}
              error={err.message}
            />,
          );
        });
    });
  }, [locations, mapReady]);

  return (
    <div className="map-wrapper">
      {error && <div className="map-error">{error}</div>}
      <div ref={mapContainerRef} className="map-container" />
      {locations.length === 0 && !error && (
        <div className="map-empty">
          <p>No developer data yet.</p>
          <p className="map-empty__hint">
            Start the backend and run a sync with your GitHub token.
          </p>
        </div>
      )}
    </div>
  );
}
