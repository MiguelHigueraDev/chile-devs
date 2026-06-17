import type { FeatureCollection } from "geojson";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useMapData } from "../api/queries";
import { useAccumulatedReposInViewport } from "@/lib/use-accumulated-repos-in-viewport";
import { formatViewportBbox } from "@/lib/viewport-bbox";
import type { MapLocation, MapMode, MapRepo } from "../types/api";
import {
  REPO_SCOPE_COLOR,
  REPO_STAR_RADIUS,
  REPO_STAR_COLOR,
  REPO_CLUSTER_RADIUS,
  CLUSTER_RADIUS,
  DEV_COUNT_COLOR,
  MAP_STYLE,
  ZOOM_SCALED_RADIUS,
} from "@/lib/map-styles";
import { formatNumber, truncateText } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { MapLegend } from "./map-legend";

const CHILE_CENTER: [number, number] = [-71.543, -35.675];
const MAX_ZOOM = 12;

const SOURCE_ID = "locations";
const CLUSTER_LAYER_ID = "location-clusters";
const CLUSTER_LABEL_LAYER_ID = "location-cluster-labels";
const POINT_LAYER_ID = "location-points";
const POINT_LABEL_LAYER_ID = "location-point-labels";
const INTERACTIVE_LAYERS = [CLUSTER_LAYER_ID, POINT_LAYER_ID] as const;

const REPO_SOURCE_ID = "repos";
const REPO_CLUSTER_LAYER_ID = "repo-clusters";
const REPO_CLUSTER_LABEL_LAYER_ID = "repo-cluster-labels";
const REPO_POINT_LAYER_ID = "repo-points";
const REPO_LABEL_LAYER_ID = "repo-point-labels";
const REPO_INTERACTIVE_LAYERS = [
  REPO_CLUSTER_LAYER_ID,
  REPO_POINT_LAYER_ID,
] as const;
const DEV_LAYER_IDS = [
  CLUSTER_LAYER_ID,
  CLUSTER_LABEL_LAYER_ID,
  POINT_LAYER_ID,
  POINT_LABEL_LAYER_ID,
] as const;
const REPO_LAYER_IDS = [
  REPO_CLUSTER_LAYER_ID,
  REPO_CLUSTER_LABEL_LAYER_ID,
  REPO_POINT_LAYER_ID,
  REPO_LABEL_LAYER_ID,
] as const;

type ChileMapProps = {
  mode: MapMode;
  onMapModeChange: (mode: MapMode) => void;
  onLocationSelect: (location: MapLocation) => void;
  onRepoSelect: (repo: MapRepo) => void;
};

type MapTooltip = {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  description?: string;
};

type ClusterChooser =
  | {
      kind: "locations";
      x: number;
      y: number;
      locations: MapLocation[];
    }
  | {
      kind: "repos";
      x: number;
      y: number;
      repos: MapRepo[];
    };

function featureToMapLocation(feature: GeoJSON.Feature): MapLocation {
  const props = feature.properties as {
    slug: string;
    name: string;
    kind: MapLocation["kind"];
    devCount: number;
    totalContributions: number;
  };
  const coordinates =
    feature.geometry.type === "Point"
      ? (feature.geometry.coordinates as [number, number])
      : CHILE_CENTER;

  return {
    slug: props.slug,
    name: props.name,
    kind: props.kind,
    lat: coordinates[1],
    lng: coordinates[0],
    devCount: props.devCount,
    totalContributions: props.totalContributions,
  };
}

function locationsToGeoJson(locations: MapLocation[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((loc) => ({
      type: "Feature",
      geometry: {
        type: "Point",
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
  };
}

function formatMapBounds(bounds: maplibregl.LngLatBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return formatViewportBbox({
    minLng: sw.lng,
    minLat: sw.lat,
    maxLng: ne.lng,
    maxLat: ne.lat,
  });
}

function reposToGeoJson(repos: MapRepo[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: repos.map((repo) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [repo.lng, repo.lat],
      },
      properties: {
        repoGithubId: repo.repoGithubId,
        nameWithOwner: repo.nameWithOwner,
        name: repo.name,
        stars: repo.stars,
        scope: repo.scope,
        primaryLanguage: repo.primaryLanguage,
      },
    })),
  };
}

function resolveRepoFromFeature(
  feature: GeoJSON.Feature,
  repos: MapRepo[],
): MapRepo | null {
  const repoGithubId = feature.properties?.repoGithubId as string | undefined;
  if (!repoGithubId) return null;
  return repos.find((repo) => repo.repoGithubId === repoGithubId) ?? null;
}

export function ChileMap({
  mode,
  onMapModeChange,
  onLocationSelect,
  onRepoSelect,
}: ChileMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const onRepoSelectRef = useRef(onRepoSelect);
  const modeRef = useRef(mode);
  const { data: locations = [], error, isPending } = useMapData();
  const [mapReady, setMapReady] = useState(false);
  const [viewportBbox, setViewportBbox] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<MapTooltip | null>(null);
  const [chooser, setChooser] = useState<ClusterChooser | null>(null);
  const { data: repos = [], isFetching: reposFetching, hasChileIntersection } =
    useAccumulatedReposInViewport(viewportBbox, mode === "repos");
  const reposRef = useRef(repos);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    onRepoSelectRef.current = onRepoSelect;
  }, [onRepoSelect]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    reposRef.current = repos;
  }, [repos]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: CHILE_CENTER,
      zoom: 4,
      minZoom: 3,
      maxZoom: MAX_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    const updateViewportBbox = () => {
      setViewportBbox(formatMapBounds(map.getBounds()));
    };

    map.on("load", () => {
      setMapReady(true);
      updateViewportBbox();
    });
    map.on("moveend", updateViewportBbox);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: locationsToGeoJson([]),
      cluster: true,
      clusterMaxZoom: MAX_ZOOM,
      clusterRadius: 55,
      clusterProperties: {
        devCount: ["+", ["get", "devCount"]],
        totalContributions: ["+", ["get", "totalContributions"]],
      },
    });

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": CLUSTER_RADIUS,
        "circle-color": DEV_COUNT_COLOR,
        "circle-opacity": 0.65,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.5,
      },
    });

    map.addLayer({
      id: CLUSTER_LABEL_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "devCount"]],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });

    map.addLayer({
      id: POINT_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ZOOM_SCALED_RADIUS,
        "circle-color": DEV_COUNT_COLOR,
        "circle-opacity": 0.6,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.6,
      },
    });

    map.addLayer({
      id: POINT_LABEL_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["to-string", ["get", "devCount"]],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });

    map.addSource(REPO_SOURCE_ID, {
      type: "geojson",
      data: reposToGeoJson([]),
      cluster: true,
      clusterMaxZoom: MAX_ZOOM,
      clusterRadius: 55,
      clusterProperties: {
        stars: ["+", ["get", "stars"]],
      },
    });

    map.addLayer({
      id: REPO_CLUSTER_LAYER_ID,
      type: "circle",
      source: REPO_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": REPO_CLUSTER_RADIUS,
        "circle-color": REPO_STAR_COLOR,
        "circle-opacity": 0.7,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.5,
      },
    });

    map.addLayer({
      id: REPO_CLUSTER_LABEL_LAYER_ID,
      type: "symbol",
      source: REPO_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });

    map.addLayer({
      id: REPO_POINT_LAYER_ID,
      type: "circle",
      source: REPO_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": REPO_STAR_RADIUS,
        "circle-color": REPO_SCOPE_COLOR,
        "circle-opacity": 0.85,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.7,
      },
    });

    map.addLayer({
      id: REPO_LABEL_LAYER_ID,
      type: "symbol",
      source: REPO_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["slice", ["get", "name"], 0, 1],
        "text-size": 10,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });

    const handleClusterClick = async (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const clusterId = feature.properties?.cluster_id as number;
      const pointCount = feature.properties?.point_count as number;
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      const coordinates =
        feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : CHILE_CENTER;

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);

        if (zoom <= MAX_ZOOM) {
          map.easeTo({
            center: coordinates,
            zoom,
            duration: 500,
          });
          return;
        }

        const leaves = await source.getClusterLeaves(
          clusterId,
          Math.max(pointCount, 10),
          0,
        );
        setTooltip(null);
        setChooser({
          kind: "locations",
          x: event.point.x,
          y: event.point.y,
          locations: leaves.map(featureToMapLocation),
        });
      } catch {
        // Ignore cluster expansion errors
      }
    };

    const handlePointClick = (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feature = event.features?.[0];
      if (!feature?.properties) return;

      const props = feature.properties;
      const coordinates =
        feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : CHILE_CENTER;

      onLocationSelectRef.current({
        slug: props.slug as string,
        name: props.name as string,
        kind: props.kind as MapLocation["kind"],
        lat: coordinates[1],
        lng: coordinates[0],
        devCount: props.devCount as number,
        totalContributions: props.totalContributions as number,
      });
    };

    const handleRepoClusterClick = async (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const clusterId = feature.properties?.cluster_id as number;
      const pointCount = feature.properties?.point_count as number;
      const source = map.getSource(REPO_SOURCE_ID) as maplibregl.GeoJSONSource;
      const coordinates =
        feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : CHILE_CENTER;

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);

        if (zoom <= MAX_ZOOM) {
          map.easeTo({
            center: coordinates,
            zoom,
            duration: 500,
          });
          return;
        }

        const leaves = await source.getClusterLeaves(
          clusterId,
          Math.max(pointCount, 10),
          0,
        );
        const clusterRepos = leaves
          .map((leaf) => resolveRepoFromFeature(leaf, reposRef.current))
          .filter((repo): repo is MapRepo => repo != null);

        if (clusterRepos.length === 0) return;

        setTooltip(null);
        setChooser({
          kind: "repos",
          x: event.point.x,
          y: event.point.y,
          repos: clusterRepos,
        });
      } catch {
        // Ignore cluster expansion errors
      }
    };

    const handleRepoClick = (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const repo = resolveRepoFromFeature(feature, reposRef.current);
      if (repo) {
        onRepoSelectRef.current(repo);
      }
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const activeLayers =
        modeRef.current === "repos"
          ? [...REPO_INTERACTIVE_LAYERS]
          : [...INTERACTIVE_LAYERS];
      const features = map.queryRenderedFeatures(event.point, {
        layers: activeLayers,
      });
      const feature = features[0];

      if (!feature?.properties) {
        setTooltip(null);
        map.getCanvas().style.cursor = "";
        return;
      }

      map.getCanvas().style.cursor = "pointer";

      if (modeRef.current === "repos") {
        const isCluster = Boolean(feature.properties.point_count);
        if (isCluster) {
          const repoCount = feature.properties.point_count as number;
          const totalStars = feature.properties.stars as number;
          setTooltip({
            x: event.point.x,
            y: event.point.y,
            title: `${repoCount} repos`,
            subtitle: `${formatNumber(totalStars)} stars total`,
          });
          return;
        }

        const repo = resolveRepoFromFeature(feature, reposRef.current);
        setTooltip({
          x: event.point.x,
          y: event.point.y,
          title: feature.properties.nameWithOwner as string,
          subtitle: `${formatNumber(feature.properties.stars as number)} stars`,
          description: repo?.description
            ? truncateText(repo.description, 100)
            : undefined,
        });
        return;
      }

      const isCluster = Boolean(feature.properties.point_count);
      const devCount = feature.properties.devCount as number;

      setTooltip({
        x: event.point.x,
        y: event.point.y,
        title: isCluster
          ? `${feature.properties.point_count} locations`
          : (feature.properties.name as string),
        subtitle: `${formatNumber(devCount)} developers${isCluster ? " total" : ""}`,
      });
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      setTooltip(null);
    };

    const dismissChooser = () => setChooser(null);

    map.on("click", CLUSTER_LAYER_ID, handleClusterClick);
    map.on("click", POINT_LAYER_ID, handlePointClick);
    map.on("click", REPO_CLUSTER_LAYER_ID, handleRepoClusterClick);
    map.on("click", REPO_POINT_LAYER_ID, handleRepoClick);
    map.on("click", dismissChooser);
    map.on("movestart", dismissChooser);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseLeave);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(SOURCE_ID)) return;
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      locationsToGeoJson(locations),
    );
  }, [locations, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(REPO_SOURCE_ID)) return;
    (map.getSource(REPO_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      reposToGeoJson(repos),
    );
  }, [repos, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const devVisibility = mode === "devs" ? "visible" : "none";
    const repoVisibility = mode === "repos" ? "visible" : "none";

    for (const layerId of DEV_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", devVisibility);
      }
    }

    for (const layerId of REPO_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", repoVisibility);
      }
    }
  }, [mode, mapReady]);

  const handleModeChange = (nextMode: MapMode) => {
    if (nextMode === mode) return;
    setChooser(null);
    setTooltip(null);
    onMapModeChange(nextMode);
  };

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

      <div
        className="border-border/60 bg-card/90 absolute top-4 left-4 z-10 inline-flex rounded-lg border p-1 shadow-lg backdrop-blur-sm"
        role="tablist"
        aria-label="Map view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "devs"}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "devs"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => handleModeChange("devs")}
        >
          Dev distribution
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "repos"}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "repos"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => handleModeChange("repos")}
        >
          Featured repos
        </button>
      </div>

      {chooser && (
        <Card
          className="absolute z-30 w-56 gap-0 overflow-hidden border-border/60 bg-popover/95 py-0 shadow-xl backdrop-blur-md"
          style={{
            left: Math.min(chooser.x + 12, window.innerWidth - 260),
            top: chooser.y + 12,
          }}
        >
          <p className="text-muted-foreground border-b px-3 py-2 text-[10px] font-medium tracking-wider uppercase">
            {chooser.kind === "locations"
              ? "Locations at this point"
              : "Repos at this point"}
          </p>
          {chooser.kind === "locations" ? (
            <ul className="divide-border divide-y">
              {chooser.locations.map((loc) => (
                <li key={loc.slug}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                    onClick={() => {
                      setChooser(null);
                      onLocationSelectRef.current(loc);
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
                      {formatNumber(loc.devCount)} devs
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-border max-h-64 divide-y overflow-y-auto">
              {chooser.repos.map((repo) => (
                <li key={repo.repoGithubId}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                    onClick={() => {
                      setChooser(null);
                      onRepoSelectRef.current(repo);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {repo.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {repo.nameWithOwner}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatNumber(repo.stars)} ★
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 12,
          }}
        >
          <p className="font-medium">{tooltip.title}</p>
          <p className="text-muted-foreground">{tooltip.subtitle}</p>
          {tooltip.description && (
            <p className="text-muted-foreground mt-1 leading-snug">
              {tooltip.description}
            </p>
          )}
        </div>
      )}

      <MapLegend mode={mode} />

      {mode === "repos" && reposFetching && (
        <Card className="pointer-events-none absolute top-4 right-4 z-10 border-border/60 bg-card/90 py-2 shadow-lg backdrop-blur-sm">
          <CardContent className="text-muted-foreground px-3 py-0 text-xs">
            Loading repos…
          </CardContent>
        </Card>
      )}

      {mode === "devs" && !isPending && locations.length === 0 && !error && (
        <Card className="pointer-events-none absolute bottom-6 left-1/2 z-10 max-w-sm -translate-x-1/2 border-border/60 bg-card/90 py-4 shadow-lg backdrop-blur-sm">
          <CardContent className="space-y-1 px-5 py-0 text-center">
            <p className="text-sm font-medium">No developer data yet</p>
            <p className="text-muted-foreground text-xs">
              Start the backend and run a sync with your GitHub token.
            </p>
          </CardContent>
        </Card>
      )}

      {mode === "repos" &&
        !reposFetching &&
        hasChileIntersection &&
        viewportBbox != null &&
        repos.length === 0 &&
        !error && (
          <Card className="pointer-events-none absolute bottom-6 left-1/2 z-10 max-w-sm -translate-x-1/2 border-border/60 bg-card/90 py-4 shadow-lg backdrop-blur-sm">
            <CardContent className="space-y-1 px-5 py-0 text-center">
              <p className="text-sm font-medium">No featured repos in view</p>
              <p className="text-muted-foreground text-xs">
                Pan or zoom to another area.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
