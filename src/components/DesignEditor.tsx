import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maptalks from 'maptalks';
import * as turf from '@turf/turf';
// Sun position for shadow direction/length
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as SunCalc from 'suncalc';
import { ProjectData, Design, FieldSegment } from '../types/project';
import type { Module } from '../types/library';
import { ArrowLeft, Check, RotateCcw, RotateCw, Settings, LayoutGrid, Crosshair, GitBranch, PlusCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { formatArea, formatDistance } from '../utils/mapUtils';
import CreateFieldSegmentPanel from './CreateFieldSegmentPanel';
import FieldSegmentPanel from './FieldSegmentPanel';
import { supabase } from '../integrations/supabase/client';

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

type EditorTool = 'none' | 'draw' | 'edit' | 'delete';
type SavingStatus = 'idle' | 'saving' | 'saved' | 'error';

const SNAP_DISTANCE_PX = 15;

const defaultSymbol = {
  lineColor: '#f97316',
  lineWidth: 3,
  polygonFill: '#f97316',
  polygonOpacity: 0.3,
};
const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' };

const defaultGhostSymbol = { 'markerType': 'ellipse' as const, 'markerFill': '#22c55e', 'markerWidth': 10, 'markerHeight': 10, 'markerLineWidth': 0 };
const snapGhostSymbol = { 'markerType': 'ellipse' as const, 'markerFill': '#22c55e', 'markerWidth': 14, 'markerHeight': 14, 'markerLineWidth': 2, 'markerLineColor': '#ffffff' };

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);
  
  const [activeSidebarTab, setActiveSidebarTab] = useState('mechanical');
  const [activeTool, setActiveTool] = useState<EditorTool>('none');
  
  const [fieldSegments, setFieldSegments] = useState<FieldSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [isEditingShape, setIsEditingShape] = useState(false);
  const [currentArea, setCurrentArea] = useState('0.0 ft²');
  const [isLoading, setIsLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle');
  const [isSavingNewSegment, setIsSavingNewSegment] = useState(false);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const [modules, setModules] = useState<Array<Module & { id: string }>>([]);

  // Default shadow analysis date: Dec 22 of the current year
  const dec22ThisYear = useCallback(() => {
    const y = new Date().getFullYear();
    const d = new Date(y, 11, 22); // month is 0-based
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }, []);

  const drawToolRef = useRef<maptalks.DrawTool | null>(null);
  const segmentLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const labelLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const outlineLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const wallsLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const shadowsLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const setbackLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const modulesLayerRef = useRef<maptalks.VectorLayer | null>(null);
  
  const ghostMarkerRef = useRef<maptalks.Marker | null>(null);
  const tempLabelRef = useRef<maptalks.Label | null>(null);
  const drawingIdRef = useRef<string | null>(null);
  const startMarkerRef = useRef<maptalks.Marker | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track whether hover is within snap distance of the first vertex
  const closingSnapActiveRef = useRef<boolean>(false);
  // Tooltip shown when near the first vertex
  const closeHintLabelRef = useRef<maptalks.Label | null>(null);
  // Prevent repeated auto-closing triggers within a single snap session
  const autoClosingRef = useRef<boolean>(false);

  const fieldSegmentsRef = useRef(fieldSegments);
  useEffect(() => {
    fieldSegmentsRef.current = fieldSegments;
  }, [fieldSegments]);

  // Cache of module dimensions (meters). Keys: module_id
  const [moduleDims, setModuleDims] = useState<Record<string, { width: number; height: number }>>({});
  const ensureModuleDims = useCallback(async (moduleId: string | null | undefined) => {
    if (!moduleId) return;
    if (moduleDims[moduleId]) return;
    try {
      const { data: extras, error } = await supabase
        .from('module_details')
        .select('parsed')
        .eq('module_id', moduleId)
        .single();
      
      if (error) throw error;

      let len = (extras as any)?.parsed?.length_m;
      let wid = (extras as any)?.parsed?.width_m;

      // Fallbacks if extras missing or invalid
      if (!(typeof len === 'number' && isFinite(len)) || !(typeof wid === 'number' && isFinite(wid))) {
        const mod = modules.find(m => m.id === moduleId);
        const name = `${mod?.manufacturer || ''} ${mod?.model || ''}`.trim().toLowerCase();
        // Known model mappings (extend as needed)
        const known: Array<{ test: (n: string) => boolean; w: number; h: number }> = [
          { test: (n) => n.includes('jinko') && (n.includes('jkm 260p-60') || n.includes('jkm260p-60')), w: 0.992, h: 1.65 },
        ];
        const hit = known.find(k => k.test(name));
        if (hit) {
          wid = hit.w; len = hit.h;
        } else if (mod?.area && isFinite(mod.area)) {
          // Infer from area with typical 60-cell aspect ratio ~1.66 (L/W)
          const ratio = 1.66;
          const area = mod.area as number; // m^2
          const height = Math.sqrt(area * ratio);
          const width = area / height;
          wid = width; len = height;
        }
      }

      // Final guards
      const width = (typeof wid === 'number' && isFinite(wid)) ? wid : 1.1; // m
      const height = (typeof len === 'number' && isFinite(len)) ? len : 1.7; // m
      setModuleDims((prev) => ({ ...prev, [moduleId]: { width, height } }));
    } catch {
      setModuleDims((prev) => ({ ...prev, [moduleId]: { width: 1.1, height: 1.7 } }));
    }
  }, [moduleDims, modules]);

  // Track CTRL state globally to let users rotate map without starting a draw
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) {
        if (!isCtrlDown) setIsCtrlDown(true);
        // if currently drawing, end it to avoid accidental vertices
        (drawToolRef.current as any)?.endDraw?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) setIsCtrlDown(false);
    };
    const onBlur = () => setIsCtrlDown(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isCtrlDown]);

  const updateDistanceLabels = useCallback((geometry: maptalks.Geometry, segmentId: string) => {
    if (!geometry || !labelLayerRef.current || !mapInstanceRef.current) return;
  
    const labelLayer = labelLayerRef.current;
    const map = mapInstanceRef.current;
  
    const oldGeometries = labelLayer.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
    if (oldGeometries.length) {
      labelLayer.removeGeometry(oldGeometries);
    }
  
    const altitudeMeters = (geometry as any)?.getProperties?.()?.altitude ?? 0;

    let coords: maptalks.Coordinate[];
    if (geometry instanceof maptalks.Polygon) {
      coords = geometry.getShell();
    } else if (geometry instanceof maptalks.LineString) {
      coords = geometry.getCoordinates();
    } else {
      return;
    }
  
    if (!coords || coords.length === 0) return;
  
    coords.forEach(coord => {
      if (!coord || isNaN(coord.x) || isNaN(coord.y)) return;
      const vertexMarker = new maptalks.Marker(coord, {
        symbol: { 'markerType': 'ellipse', 'markerFill': '#ffffff', 'markerWidth': 8, 'markerHeight': 8, 'markerLineWidth': 2, 'markerLineColor': '#f97316' }
      }).setProperties({ isVertex: true, segmentId: segmentId, altitude: altitudeMeters });
      labelLayer.addGeometry(vertexMarker);
    });
  
    if (coords.length < 2) return;
  
    let polyCenter: maptalks.Coordinate | null = null;
    if (geometry instanceof maptalks.Polygon) {
      polyCenter = geometry.getCenter();
    }

    const isPoly = geometry instanceof maptalks.Polygon;
    const count = coords.length;
    const loopMax = isPoly ? count : Math.max(0, count - 1);

    for (let i = 0; i < loopMax; i++) {
      const p1 = coords[i];
      const p2 = isPoly ? coords[(i + 1) % count] : coords[i + 1];
  
      if (!p1 || isNaN(p1.x) || isNaN(p1.y) || !p2 || isNaN(p2.x) || isNaN(p2.y) || (p1.x === p2.x && p1.y === p2.y)) continue;
  
      const line = new maptalks.LineString([p1, p2]);
      const distanceInMeters = line.getLength();
      const lineCenter = line.getCenter();
      if (!lineCenter || isNaN(lineCenter.x) || isNaN(lineCenter.y)) continue;

      // Calculate angle in degrees for rotation
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const mapBearing = map.getBearing();
      angle -= mapBearing;
      if (angle > 90) angle -= 180;
      else if (angle < -90) angle += 180;

      const labelOptions: any = {
        'markerRotation': angle,
        'textPlacement': 'point',
        'boxStyle': {
          'padding': [8, 6],
          'symbol': { 'markerType': 'square', 'markerFill': '#000000', 'markerLineWidth': 0 }
        },
        'textSymbol': { 'textFill': '#ffffff', 'textSize': 14, 'textWeight': 'bold' }
      };

      let anchor = lineCenter;
      if (polyCenter) {
        // It's a closed polygon, calculate outward position
        const bearingToLineCenter = turf.bearing(
          turf.point([polyCenter.x, polyCenter.y]),
          turf.point([lineCenter.x, lineCenter.y])
        );
        const offsetDistanceMeters = 30 * map.getResolution();
        const newAnchor = turf.destination(
          turf.point([lineCenter.x, lineCenter.y]),
          offsetDistanceMeters,
          bearingToLineCenter,
          { units: 'meters' }
        );
        const [newX, newY] = newAnchor.geometry.coordinates;
        anchor = new maptalks.Coordinate(newX, newY);
      } else {
        // It's an open line (during drawing), use pixel offset
        labelOptions.textDy = -30;
      }

      const label = new maptalks.Label(
        formatDistance(distanceInMeters),
        anchor,
        labelOptions
      );

      label.setProperties({ isDistanceLabel: true, segmentId: segmentId, altitude: altitudeMeters });
  labelLayer.addGeometry(label);
  // Ensure label renders on top without changing its position
  try { label.bringToFront(); } catch {}
  try { (label as any).setZIndex?.(99999); } catch {}
    }
  }, []);

  // Begin editing of a selected polygon
  const beginEditSelected = useCallback(() => {
    if (!selectedSegmentId || !segmentLayerRef.current) return;
    const geom = segmentLayerRef.current.getGeometryById(selectedSegmentId) as any;
    if (!geom || typeof geom.startEdit !== 'function') return;
    try {
      geom.startEdit({ vertexSymbol: { markerType: 'ellipse', markerFill: '#22c55e', markerLineColor: '#065f46', markerLineWidth: 2, markerWidth: 10, markerHeight: 10 } });
      setIsEditingShape(true);
      // Live update labels while dragging
      geom.on('shapechange', () => {
        try { updateDistanceLabels(geom, selectedSegmentId); } catch {}
      });
      geom.on('editvertex', () => {
        try { updateDistanceLabels(geom, selectedSegmentId); } catch {}
      });
    } catch {}
  }, [selectedSegmentId, updateDistanceLabels]);

  // Finish editing and persist geometry changes
  const endEditSelected = useCallback(async () => {
    if (!selectedSegmentId || !segmentLayerRef.current) { setIsEditingShape(false); return; }
    const geom = segmentLayerRef.current.getGeometryById(selectedSegmentId) as any;
    if (!geom) { setIsEditingShape(false); return; }
    try { if (geom.isEditing()) geom.endEdit(); } catch {}
    setIsEditingShape(false);
    // Update labels one final time
    try { updateDistanceLabels(geom, selectedSegmentId); } catch {}
    // Persist updated geometry and area
    const updatedGeometry = geom.toJSON();
    const updatedArea = geom.getArea?.() || 0;
    setFieldSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, geometry: updatedGeometry, area: updatedArea } : s));
    try {
      await supabase.from('field_segments').update({ geometry: updatedGeometry, area: updatedArea }).eq('id', selectedSegmentId);
    } catch (e) {
      console.error('Error saving edited geometry', e);
    }
  }, [selectedSegmentId, updateDistanceLabels]);

  // Helper: map DB row (snake_case) to FieldSegment (camelCase)
  const mapDbToSegment = useCallback((row: any): FieldSegment => ({
    id: row.id,
    design_id: row.design_id,
    geometry: row.geometry,
    area: row.area,
    description: row.description,
    module: row.module,
    racking: row.racking,
    surfaceHeight: row.surface_height ?? 0,
    rackingHeight: row.racking_height ?? 0,
  parapetHeight: row.parapet_height ?? 0,
    moduleAzimuth: row.module_azimuth ?? 180,
    moduleTilt: row.module_tilt ?? 10,
  // sun & shadows
  spanRise: row.span_rise ?? 1.4,
  gcr: row.gcr ?? 0.81,
  timeOfDay: row.time_of_day ?? '10:00',
  analysisDate: row.analysis_date ?? dec22ThisYear(),
  startTime: row.start_time ?? '10:00',
  endTime: row.end_time ?? '16:00',
    frameSizeUp: row.frame_size_up ?? 1,
    frameSizeWide: row.frame_size_wide ?? 1,
    defaultOrientation: row.default_orientation ?? 'Landscape',
    rowSpacing: row.row_spacing ?? 2,
    moduleSpacing: row.module_spacing ?? 0.041,
    frameSpacing: row.frame_spacing ?? 0,
    setback: row.setback ?? 4,
    alignment: row.alignment ?? 'center',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }), [dec22ThisYear]);

  // Fetch initial data
  useEffect(() => {
    const fetchSegments = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('field_segments')
            .select('*')
            .eq('design_id', design.id)
            .order('created_at', { ascending: true });
        
        if (error) {
            console.error("Error fetching field segments", error);
        } else {
            const mapped = (data || []).map(mapDbToSegment);
            setFieldSegments(mapped);
        }
        setIsLoading(false);
    };
    fetchSegments();
  }, [design.id, mapDbToSegment]);

  // Load available modules from Supabase so the panel can list them
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const { data, error } = await supabase.from('modules').select('*');
        if (error) throw error;
        setModules(data as Array<Module & { id: string }>);
      } catch (e) {
        console.error("Failed to load modules", e);
      }
    };
    fetchModules();
  }, []);

  // Preload dimensions for any selected modules in current segments
  useEffect(() => {
    const ids = Array.from(new Set(fieldSegments.map((s) => s.module).filter(Boolean))) as string[];
    if (!ids.length) return;
    (async () => {
      for (const id of ids) await ensureModuleDims(id);
    })();
  }, [fieldSegments, ensureModuleDims]);

  // Sync fieldSegments state with the map geometries
  useEffect(() => {
    const segmentLayer = segmentLayerRef.current;
    const labelLayer = labelLayerRef.current;
    const outlineLayer = outlineLayerRef.current;
    if (!segmentLayer || !labelLayer || !outlineLayer) return;

    segmentLayer.clear();
    labelLayer.clear();
    outlineLayer.clear();

    const fillSymbol = { lineColor: '#a8551a', lineWidth: 2, polygonFill: '#f97316', polygonOpacity: 0.5 } as any;
    const edgeSymbol = { lineColor: '#9a3412', lineWidth: 2, polygonOpacity: 0, lineOpacity: 1 } as any;

  fieldSegments.forEach(segment => {
  const g = maptalks.Geometry.fromJSON(segment.geometry as { [key: string]: any } | { [key: string]: any }[]) as any;
    const polygon = Array.isArray(g) ? g[0] : g;
    const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
    const meters = feet * 0.3048;
        polygon?.setSymbol?.(fillSymbol);
    polygon?.setId?.(segment.id);
    // set altitude via properties per maptalks example
    const props = { ...(polygon?.getProperties?.() || {}), altitude: meters };
    polygon?.setProperties?.(props);
    segmentLayer.addGeometry(polygon);

        // Outline geometry at same altitude
        let outlineGeo: any = polygon?.copy?.();
        if (!outlineGeo) {
          try { outlineGeo = maptalks.Geometry.fromJSON(segment.geometry as { [key: string]: any } | { [key: string]: any }[]) as any; } catch {}
        }
        if (outlineGeo) {
          outlineGeo?.setId?.(`${segment.id}-outline`);
          outlineGeo?.setSymbol?.(edgeSymbol);
          const oprops = { ...(outlineGeo?.getProperties?.() || {}), altitude: meters };
          outlineGeo?.setProperties?.(oprops);
          outlineLayer.addGeometry(outlineGeo);
        }
    updateDistanceLabels(polygon, segment.id);
  });
  }, [fieldSegments, updateDistanceLabels]);

  // Build altitude walls with 3D coordinates (no Three.js)
  useEffect(() => {
    const segmentLayer = segmentLayerRef.current;
    const wallsLayer = wallsLayerRef.current;
    const outlineLayer = outlineLayerRef.current;
    if (!segmentLayer || !wallsLayer || !outlineLayer) return;
    // segmentLayer and outline cleared in the other effect; here only rebuild walls
    wallsLayer.clear();
    fieldSegments.forEach((segment) => {
      const geom = maptalks.Geometry.fromJSON(segment.geometry as { [key: string]: any } | { [key: string]: any }[]) as any;
      const poly = Array.isArray(geom) ? geom[0] : geom;
      if (!poly || !poly.getShell) return;
      const shell: maptalks.Coordinate[] = poly.getShell();
      if (!shell || shell.length < 2) return;
      const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
      const z = feet * 0.3048; // meters
      const parapetFeet = (segment as any).parapetHeight ?? (segment as any).parapet_height ?? 0;
      const paraZ = Math.max(0, parapetFeet * 0.3048);
      // wall style
      const wallSymbol = { polygonFill: '#fb923c', polygonOpacity: 0.75, lineColor: '#9a3412', lineWidth: 1 } as any;
      for (let i = 0; i < shell.length; i++) {
        const a = shell[i];
        const b = shell[(i + 1) % shell.length];
        // Skip closing if same point
        if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
        const coords = [
          new maptalks.Coordinate(a.x, a.y, z),
          new maptalks.Coordinate(b.x, b.y, z),
          new maptalks.Coordinate(b.x, b.y, 0),
          new maptalks.Coordinate(a.x, a.y, 0),
          new maptalks.Coordinate(a.x, a.y, z), // close ring
        ];
        const wall = new maptalks.Polygon([coords], { symbol: wallSymbol });
        wallsLayer.addGeometry(wall);

        // Parapet wall strip from roof (z) to roof+parapet (z+paraZ)
        if (paraZ > 0) {
          const pcoords = [
            new maptalks.Coordinate(a.x, a.y, z + paraZ),
            new maptalks.Coordinate(b.x, b.y, z + paraZ),
            new maptalks.Coordinate(b.x, b.y, z),
            new maptalks.Coordinate(a.x, a.y, z),
            new maptalks.Coordinate(a.x, a.y, z + paraZ),
          ];
          const pwall = new maptalks.Polygon([pcoords], { symbol: wallSymbol });
          wallsLayer.addGeometry(pwall);
        }
      }
    });
  }, [fieldSegments]);

  // Build time-based ground shadows (projecting the top polygon by sun vector)
  useEffect(() => {
    const shadowsLayer = shadowsLayerRef.current;
    const map = mapInstanceRef.current;
    if (!shadowsLayer || !map) return;
    shadowsLayer.clear();
    if (!showShadows) {
      try { shadowsLayer.hide(); } catch {}
      return;
    }
    try { shadowsLayer.show(); } catch {}

  // Use the same lighter transparent color for all shadow types (natural look)
  const SHADOW_RGBA = 'rgba(0,0,0,0.01)';
  const wallShadowSymbol = { polygonFill: SHADOW_RGBA, polygonOpacity: 1, lineOpacity: 0, lineWidth: 0 } as any;
  const roofShadowSymbol = { polygonFill: SHADOW_RGBA, polygonOpacity: 1, lineOpacity: 0, lineWidth: 0 } as any;
  const baseShadowSymbol = { polygonFill: SHADOW_RGBA, polygonOpacity: 1, lineOpacity: 0, lineWidth: 0 } as any;
  const aggShadowSymbol = { polygonFill: SHADOW_RGBA, polygonOpacity: 1, lineOpacity: 0, lineWidth: 0 } as any;

    const { coordinates } = project || {} as any;
    const lat = coordinates?.lat; const lng = coordinates?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const toDateAtTime = (dateStr?: string, timeStr?: string) => {
      const base = dateStr ? new Date(dateStr) : new Date();
      // If time missing, default to noon
      const [hh = '12', mm = '00'] = (timeStr || '12:00').split(':');
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parseInt(hh), parseInt(mm), 0);
      return d;
    };

  // Helpers: prefer explicit Start Time, and optional End Time
  const getStartTime = (seg: any) => (seg?.startTime || seg?.timeOfDay || '10:00');
  // Default end time fallback ensures interval shadows appear even if DB field is missing
  const getEndTime = (seg: any) => (seg?.endTime || '16:00');
  const parseHHmmToMinutes = (t: string) => {
    const [h, m] = (t || '').split(':').map((n) => parseInt(n));
    if (isNaN(h)) return 0;
    return h * 60 + (isNaN(m) ? 0 : m);
  };

    fieldSegments.forEach((segment) => {
      const geom = maptalks.Geometry.fromJSON(segment.geometry as { [key: string]: any } | { [key: string]: any }[]) as any;
      const poly = Array.isArray(geom) ? geom[0] : geom;
      if (!poly || !poly.getShell) return;
      const shell: maptalks.Coordinate[] = poly.getShell();

      // Build turf polygons for a given time
      const buildTurfPolysAtTime = (timeStr: string): any[] => {
        const out: any[] = [];
        const dateStr = (segment as any).analysisDate || dec22ThisYear();
        const dt = toDateAtTime(dateStr, timeStr);

        let sunAz = 0; let sunAlt = 0;
        try {
          const pos = (SunCalc as any).getPosition?.(dt, lat, lng) || SunCalc.getPosition(dt, lat, lng);
          sunAz = pos.azimuth || 0;
          sunAlt = pos.altitude || 0;
        } catch {}
        if (sunAlt <= 0) return out;

        const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
        const rackingFeet = (segment as any).rackingHeight ?? (segment as any).racking_height ?? 0;
        const parapetFeet = (segment as any).parapetHeight ?? (segment as any).parapet_height ?? 0;
        const segHeightM = (feet + rackingFeet + parapetFeet) * 0.3048;
        if (!isFinite(segHeightM) || segHeightM <= 0) return out;

        const rawLen = segHeightM / Math.tan(sunAlt);
        const segShadowLen = Math.max(0, Math.min(500, rawLen));
        const sunBearingFromNorth = ((sunAz * 180 / Math.PI) + 180 + 360) % 360;
        const shadowBearing = (sunBearingFromNorth + 180) % 360;

        // Base poly
        const baseRing: [number, number][] = shell.map((c) => [c.x, c.y]);
        const basePoly = turf.polygon([baseRing[0][0] !== baseRing[baseRing.length - 1][0] || baseRing[0][1] !== baseRing[baseRing.length - 1][1] ? [...baseRing, baseRing[0]] as any : baseRing as any]);
        out.push(basePoly);

        // Shifted ring
        const shiftedRing: [number, number][] = shell.map((c) => {
          const dest = turf.destination([c.x, c.y] as any, segShadowLen, shadowBearing, { units: 'meters' });
          return dest.geometry.coordinates as [number, number];
        });
        const roofPoly = turf.polygon([shiftedRing[0][0] !== shiftedRing[shiftedRing.length - 1][0] || shiftedRing[0][1] !== shiftedRing[shiftedRing.length - 1][1] ? [...shiftedRing, shiftedRing[0]] as any : shiftedRing as any]);
        out.push(roofPoly);

        // Wall quads (include closing edge)
        for (let i = 0; i < shell.length; i++) {
          const ni = (i + 1) % shell.length;
          const a = shell[i];
          const b = shell[ni];
          const [axp, ayp] = shiftedRing[i];
          const [bxp, byp] = shiftedRing[ni];
          const ring: [number, number][] = [
            [a.x, a.y], [b.x, b.y], [bxp, byp], [axp, ayp], [a.x, a.y]
          ];
          out.push(turf.polygon([ring]));
        }
        return out;
      };

      const drawAtTime = (timeStr: string) => {
        const dateStr = (segment as any).analysisDate || dec22ThisYear();
        const dt = toDateAtTime(dateStr, timeStr);

        let sunAz = 0;
        let sunAlt = 0;
        try {
          const pos = (SunCalc as any).getPosition?.(dt, lat, lng) || SunCalc.getPosition(dt, lat, lng);
          sunAz = pos.azimuth || 0;
          sunAlt = pos.altitude || 0;
        } catch {}
        if (sunAlt <= 0) return;

        const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
        const rackingFeet = (segment as any).rackingHeight ?? (segment as any).racking_height ?? 0;
        const parapetFeet = (segment as any).parapetHeight ?? (segment as any).parapet_height ?? 0;
        const segHeightM = (feet + rackingFeet + parapetFeet) * 0.3048;
        if (!isFinite(segHeightM) || segHeightM <= 0) return;

        const rawLen = segHeightM / Math.tan(sunAlt);
        const segShadowLen = Math.max(0, Math.min(500, rawLen));
        const sunBearingFromNorth = ((sunAz * 180 / Math.PI) + 180 + 360) % 360;
        const shadowBearing = (sunBearingFromNorth + 180) % 360;

        const basePoly = new maptalks.Polygon([shell.map((c) => new maptalks.Coordinate(c.x, c.y))], { symbol: baseShadowSymbol });
        basePoly.setProperties?.({ ...(basePoly.getProperties?.() || {}), altitude: 0 });
        shadowsLayer.addGeometry(basePoly);

        const shiftedRing: [number, number][] = shell.map((c) => {
          const pt = turf.point([c.x, c.y]);
          const dest = turf.destination(pt, segShadowLen, shadowBearing, { units: 'meters' });
          const [dx, dy] = dest.geometry.coordinates as [number, number];
          return [dx, dy];
        });
        const roofShadowPoly = new maptalks.Polygon([shiftedRing.map(([x, y]) => new maptalks.Coordinate(x, y))], { symbol: roofShadowSymbol });
        roofShadowPoly.setProperties?.({ ...(roofShadowPoly.getProperties?.() || {}), altitude: 0 });
        shadowsLayer.addGeometry(roofShadowPoly);

        for (let i = 0; i < shell.length; i++) {
          const ni = (i + 1) % shell.length;
          const a = shell[i];
          const b = shell[ni];
          const [axp, ayp] = shiftedRing[i];
          const [bxp, byp] = shiftedRing[ni];
          const quadRing = [
            new maptalks.Coordinate(a.x, a.y),
            new maptalks.Coordinate(b.x, b.y),
            new maptalks.Coordinate(bxp, byp),
            new maptalks.Coordinate(axp, ayp),
            new maptalks.Coordinate(a.x, a.y),
          ];
          const quad = new maptalks.Polygon([quadRing], { symbol: wallShadowSymbol });
          quad.setProperties?.({ ...(quad.getProperties?.() || {}), altitude: 0 });
          shadowsLayer.addGeometry(quad);
        }
      };

      // Build aggregated union across intervals between start and end (hourly)
  const startTs = getStartTime(segment as any);
  const endTs = getEndTime(segment as any);
      let minutesStart = parseHHmmToMinutes(startTs || '10:00');
      let minutesEnd = endTs ? parseHHmmToMinutes(endTs) : minutesStart;
      if (minutesEnd < minutesStart) [minutesStart, minutesEnd] = [minutesEnd, minutesStart];
  const STEP = 1; // minutes per step (per-minute)
  let agg: any | null = null;
      for (let m = minutesStart; m <= minutesEnd; m += STEP) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const ts = `${hh}:${mm}`;
        const polys = buildTurfPolysAtTime(ts);
        for (const p of polys) {
          try {
            agg = agg ? (turf.union as any)(agg, p) : p;
          } catch {}
        }
      }
      if (agg) {
        const geom = agg.geometry;
        const addMp = (coords: any[][]) => {
          const rings = coords.map((ring) => ring.map(([x, y]: [number, number]) => new maptalks.Coordinate(x, y)));
          const poly = new maptalks.Polygon(rings, { symbol: aggShadowSymbol });
          poly.setProperties?.({ ...(poly.getProperties?.() || {}), altitude: 0 });
          shadowsLayer.addGeometry(poly);
        };
        if (geom.type === 'Polygon') {
          addMp(geom.coordinates as any);
        } else if (geom.type === 'MultiPolygon') {
          for (const part of geom.coordinates as any[]) addMp(part);
        }
      }

      // Draw each hour's shadow between start and end (inclusive)
      for (let m = minutesStart; m <= minutesEnd; m += STEP) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const ts = `${hh}:${mm}`;
        drawAtTime(ts);
      }
    });

    try { shadowsLayer.bringToBack(); } catch {}
  }, [fieldSegments, showShadows, project, dec22ThisYear]);

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool !== 'draw' || !mapInstanceRef.current || !drawToolRef.current) return;
    const map = mapInstanceRef.current;
    const drawTool = drawToolRef.current as any;
    const mouseCoord = e.coordinate;
    if (!mouseCoord || typeof mouseCoord.x !== 'number' || isNaN(mouseCoord.x) || typeof mouseCoord.y !== 'number' || isNaN(mouseCoord.y)) return;
    if (!ghostMarkerRef.current && labelLayerRef.current) {
        ghostMarkerRef.current = new maptalks.Marker(mouseCoord, { symbol: defaultGhostSymbol }).addTo(labelLayerRef.current);
    }
    if (ghostMarkerRef.current) {
        ghostMarkerRef.current.setCoordinates(mouseCoord).show();
    }
    if (tempLabelRef.current) {
      tempLabelRef.current.remove();
      tempLabelRef.current = null;
    }
  const currentGeom = drawTool.getCurrentGeometry?.();
  if (!currentGeom) return;
  const coords = (currentGeom.getCoordinates?.() as any[]) || [];
    if (!coords || coords.length === 0) return;
  let snapped = false;
  let isClosingSnap = false;
    const snapDistanceMeters = SNAP_DISTANCE_PX * map.getResolution();
    const turfMousePoint = turf.point([mouseCoord.x, mouseCoord.y]);
    if (coords.length > 2) {
        const startPoint = turf.point([coords[0].x, coords[0].y]);
        const distToStart = turf.distance(turfMousePoint, startPoint, { units: 'meters' });
    if (distToStart < snapDistanceMeters) {
            snapped = true;
            isClosingSnap = true;
        }
    }
  drawTool.setSymbol?.(isClosingSnap ? closingSymbol : defaultSymbol);
  // Share snap state so other handlers can react
  closingSnapActiveRef.current = isClosingSnap;
  ghostMarkerRef.current?.setSymbol((snapped ? snapGhostSymbol : defaultGhostSymbol) as any);
  // Magnetic snap: move ghost marker to first vertex and auto-close when near
  try {
    const currentGeom = drawTool.getCurrentGeometry?.();
    const coords = (currentGeom?.getCoordinates?.() as any[]) || [];
    if (isClosingSnap && Array.isArray(coords) && coords.length > 2) {
      const first = coords[0];
      const startCoord = startMarkerRef.current?.getCoordinates?.() || (first ? new maptalks.Coordinate(first.x, first.y) : null);
      if (startCoord) {
        // Move ghost to exact start
        if (ghostMarkerRef.current) ghostMarkerRef.current.setCoordinates(startCoord);
        // Force the current drawing geometry last point to be exactly the start point
        if (currentGeom && typeof currentGeom.setCoordinates === 'function') {
          const updated = coords.slice();
          updated[updated.length - 1] = new maptalks.Coordinate(startCoord.x, startCoord.y);
          currentGeom.setCoordinates(updated as any);
        }
      }
      if (!autoClosingRef.current) {
        autoClosingRef.current = true;
        (drawToolRef.current as any)?.endDraw?.();
      }
    } else if (!isClosingSnap) {
      autoClosingRef.current = false;
    }
  } catch {}
  // Show or hide the "Click to close" hint near the first vertex
  try {
    if (isClosingSnap && startMarkerRef.current && labelLayerRef.current) {
      const startCoord = startMarkerRef.current.getCoordinates?.();
      if (startCoord && !closeHintLabelRef.current) {
        const hint = new maptalks.Label(
          'Click to close',
          startCoord,
          {
            textPlacement: 'point',
            textDy: -24,
            boxStyle: {
              padding: [6, 6],
              symbol: { markerType: 'square', markerFill: '#111827', markerLineWidth: 0 }
            },
            textSymbol: { textFill: '#ffffff', textSize: 12, textWeight: 'bold' }
          } as any
        );
        hint.addTo(labelLayerRef.current);
        closeHintLabelRef.current = hint;
      }
    } else if (closeHintLabelRef.current) {
      closeHintLabelRef.current.remove();
      closeHintLabelRef.current = null;
    }
  } catch {}
    if (coords.length >= 2) {
        const lastClickedVertex = coords[coords.length - 2];
        const mouseVertex = coords[coords.length - 1];
        const lineForMeasurement = new maptalks.LineString([lastClickedVertex, mouseVertex]);
        const distance = lineForMeasurement.getLength();
        const center = lineForMeasurement.getCenter();
    if (center && !isNaN(center.x) && !isNaN(center.y)) {
      // Calculate angle
      const dx = mouseVertex.x - lastClickedVertex.x;
      const dy = mouseVertex.y - lastClickedVertex.y;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const bearing = map.getBearing();
      angle -= bearing;
      if (angle > 90) angle -= 180;
      else if (angle < -90) angle += 180;
            const tempLabel = new maptalks.Label(
              formatDistance(distance),
              center,
              {
                'markerRotation': angle,
                'textPlacement': 'point',
                'textDy': -30,
                'boxStyle': {
                  'padding': [8, 6],
                  'symbol': { 'markerType': 'square', 'markerFill': '#000000', 'markerLineWidth': 0 }
                },
                'textSymbol': { 'textFill': '#ffffff', 'textSize': 14, 'textWeight': 'bold' }
              } as any
            );
            tempLabel.addTo(labelLayerRef.current!);
            tempLabelRef.current = tempLabel;
        }
    }
  }, [activeTool]);

  const setupDrawingListeners = useCallback(() => {
    const drawTool = drawToolRef.current as any;
    if (!drawTool) return;
    drawTool.off?.();
    drawTool.on?.('drawstart', (e: any) => {
      drawingIdRef.current = String(((maptalks as any).Util?.UID?.()) ?? Math.random());
      startMarkerRef.current = new maptalks.Marker(e.coordinate, {
        interactive: true,
        symbol: {
          markerFile: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'),
          markerWidth: 20, markerHeight: 20,
        }
      }).setProperties({ isStartMarker: true });
      startMarkerRef.current.on('mousedown', (evt: any) => {
        const currentGeom = (drawToolRef.current as any)?.getCurrentGeometry?.();
        const coords = currentGeom?.getCoordinates?.();
        if (currentGeom && Array.isArray(coords) && coords.length > 2) {
          evt?.domEvent?.stopPropagation?.();
          (drawToolRef.current as any)?.endDraw?.();
        }
      });
      labelLayerRef.current?.addGeometry(startMarkerRef.current);
    });
    drawTool.on?.('drawvertex', (e: any) => {
      if (e.geometry && drawingIdRef.current) {
        if (tempLabelRef.current) {
          tempLabelRef.current.remove();
          tempLabelRef.current = null;
        }
        setCurrentArea(formatArea(e.geometry.getArea()));
        updateDistanceLabels(e.geometry, drawingIdRef.current);
        // If the newly added vertex is within snap distance of the starting point, close the polygon
        try {
          const coords: maptalks.Coordinate[] = (e.geometry.getCoordinates?.() as any[]) || [];
          if (Array.isArray(coords) && coords.length > 2) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (first && last) {
              const snapDistanceMeters = SNAP_DISTANCE_PX * (mapInstanceRef.current?.getResolution?.() || 1);
              const d = turf.distance(
                turf.point([last.x, last.y]),
                turf.point([first.x, first.y]),
                { units: 'meters' }
              );
              if (d < snapDistanceMeters) {
                // End drawing to close polygon
                (drawToolRef.current as any)?.endDraw?.();
              }
            }
          }
        } catch {}
      }
    });
  drawTool.on?.('drawend', (e: any) => {
      (async () => {
      if (tempLabelRef.current) tempLabelRef.current.remove();
      if (ghostMarkerRef.current) ghostMarkerRef.current.hide();
      if (startMarkerRef.current) startMarkerRef.current.remove();
  if (closeHintLabelRef.current) { closeHintLabelRef.current.remove(); closeHintLabelRef.current = null; }
      drawTool.setSymbol?.(defaultSymbol);
      if (drawingIdRef.current && labelLayerRef.current) {
        const tempGeometries = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === drawingIdRef.current);
        labelLayerRef.current.removeGeometry(tempGeometries);
      }
      if (!e.geometry) return;
      // Re-render labels on the finalized, closed geometry (includes closing edge)
      try {
        if (drawingIdRef.current) {
          updateDistanceLabels(e.geometry, drawingIdRef.current);
        }
      } catch {}
      
      setIsSavingNewSegment(true);
      drawingIdRef.current = null;

  const newSegmentData: any = {
        design_id: design.id,
        geometry: e.geometry.toJSON(),
        area: e.geometry.getArea(),
        description: `Field Segment ${fieldSegmentsRef.current.length + 1}`,
        module: null,
        racking: 'Fixed Tilt Racking',
        surface_height: 0, // default to 30 ft for immediate visibility
        racking_height: 0,
  parapet_height: 0,
        module_azimuth: 180,
        module_tilt: 10,
  span_rise: 1.4,
  gcr: 0.81,
  time_of_day: '10:00',
  analysis_date: dec22ThisYear(),
  start_time: '10:00',
  end_time: '16:00',
        frame_size_up: 1,
        frame_size_wide: 1,
        default_orientation: 'Landscape',
        row_spacing: 2,
        module_spacing: 0.041,
        frame_spacing: 0,
        setback: 4,
        alignment: 'center',
      };
      const stripSun = (obj: any) => {
        const { span_rise, gcr, time_of_day, analysis_date, start_time, end_time, parapet_height, ...rest } = obj || {};
        return rest;
      };

      let insertedSegment: any = null;
      let error: any = null;
      try {
        const res = await supabase.from('field_segments').insert(newSegmentData).select().single();
        insertedSegment = (res as any).data;
        error = (res as any).error;
      } catch (err) {
        error = err;
      }
      if (error && String(error.message || error.details || '').toLowerCase().includes('column')) {
        const res2 = await supabase.from('field_segments').insert(stripSun(newSegmentData)).select().single();
        insertedSegment = (res2 as any).data;
        error = (res2 as any).error;
      }

      setIsSavingNewSegment(false);
      setActiveTool('none');

  if (error) {
        console.error("Error creating field segment:", error);
      } else if (insertedSegment) {
        const mapped = mapDbToSegment(insertedSegment);
        setFieldSegments(prev => [...prev, mapped]);
        setSelectedSegmentId(mapped.id);
      }
      })();
    });
  }, [updateDistanceLabels, design.id, dec22ThisYear, mapDbToSegment]);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && project.coordinates) {
      const map = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 19,
        pitch: 0, // start top-down (rooftop view)
        bearing: 0,
        dragRotate: true,
        baseLayer: new maptalks.TileLayer('base', { urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' }),
      });
      mapInstanceRef.current = map;
  // enableAltitude to render geometries with their altitude property
  segmentLayerRef.current = new maptalks.VectorLayer('fieldSegments', { enableAltitude: true }).addTo(map);
  shadowsLayerRef.current = new maptalks.VectorLayer('fieldShadows', { enableAltitude: true }).addTo(map);
  outlineLayerRef.current = new maptalks.VectorLayer('fieldOutlines', { enableAltitude: true }).addTo(map);
  outlineLayerRef.current.bringToFront();
  labelLayerRef.current = new maptalks.VectorLayer('labels', { enableAltitude: true }).addTo(map);
  wallsLayerRef.current = new maptalks.VectorLayer('fieldWalls', { enableAltitude: true }).addTo(map);
  setbackLayerRef.current = new maptalks.VectorLayer('setbacks', { enableAltitude: true }).addTo(map);
  modulesLayerRef.current = new maptalks.VectorLayer('modules', { enableAltitude: true }).addTo(map);
  // Layer order: walls below top fill, outline above all
  try { shadowsLayerRef.current.bringToBack(); } catch {}
  segmentLayerRef.current.bringToFront();
  try { setbackLayerRef.current.bringToFront(); } catch {}
  try { modulesLayerRef.current.bringToFront(); } catch {}
  outlineLayerRef.current.bringToFront();
  // Keep labels above everything else (z-index-like) without moving them
  try { labelLayerRef.current.bringToFront(); } catch {}
      drawToolRef.current = new maptalks.DrawTool({ mode: 'Polygon', symbol: defaultSymbol }).addTo(map);
      setupDrawingListeners();
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }
  }, [project.coordinates, setupDrawingListeners]);

  // Helper to convert maptalks polygon to turf polygon (ensuring closed ring)
  const toTurfPolygon = (poly: maptalks.Polygon) => {
    const shell = poly.getShell();
    const ring: [number, number][] = shell.map((c) => [c.x, c.y]);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    return turf.polygon([ring]);
  };

  const meters = (ft: number) => (Number.isFinite(ft) ? ft * 0.3048 : 0);

  // Render setback overlay and auto-layout modules for each segment
  useEffect(() => {
    const segmentLayer = segmentLayerRef.current;
    const setbackLayer = setbackLayerRef.current;
    const modulesLayer = modulesLayerRef.current;
    if (!segmentLayer || !setbackLayer || !modulesLayer) return;
    setbackLayer.clear();
    modulesLayer.clear();

  const setbackSymbol = { lineColor: '#f59e0b', lineWidth: 1, lineDasharray: [6, 6], polygonFill: '#fef08a', polygonOpacity: 0.45 } as any;
    const moduleSymbol = { lineColor: '#111827', lineWidth: 1, polygonFill: '#374151', polygonOpacity: 0.85 } as any;

    // Build rotated rectangle given local X/Y bearings
    const buildRotatedRect = (center: any, halfW: number, halfH: number, bearingX: number, bearingY: number): any => {
      const minusX = turf.destination(center, halfW, (bearingX + 180) % 360, { units: 'meters' });
      const plusX = turf.destination(center, halfW, bearingX, { units: 'meters' });
      const tl = turf.destination(minusX, halfH, bearingY, { units: 'meters' });
      const bl = turf.destination(minusX, halfH, (bearingY + 180) % 360, { units: 'meters' });
      const tr = turf.destination(plusX, halfH, bearingY, { units: 'meters' });
      const br = turf.destination(plusX, halfH, (bearingY + 180) % 360, { units: 'meters' });
      return turf.polygon([[
        tl.geometry.coordinates as any,
        tr.geometry.coordinates as any,
        br.geometry.coordinates as any,
        bl.geometry.coordinates as any,
        tl.geometry.coordinates as any,
      ]]);
    };

    fieldSegments.forEach((segment) => {
      const geom = maptalks.Geometry.fromJSON(segment.geometry as any) as any;
      const poly = Array.isArray(geom) ? (geom[0] as maptalks.Polygon) : (geom as maptalks.Polygon);
      if (!poly || !poly.getShell) return;

      // Draw setback overlay (inset polygon)
      const turfPoly = toTurfPolygon(poly);
      const inset = (() => {
        try {
          const sb = meters(segment.setback || 0);
          if (!isFinite(sb) || sb <= 0) return turfPoly;
          const buff = turf.buffer(turfPoly, -sb, { units: 'meters' });
          if (!buff) return turfPoly;
          // Handle MultiPolygon by taking the largest area piece
          if (buff.geometry.type === 'MultiPolygon') {
            let maxA = -Infinity; let best: any = null;
            for (const coords of buff.geometry.coordinates) {
              const p = turf.polygon(coords as any);
              const a = turf.area(p);
              if (a > maxA) { maxA = a; best = p; }
            }
            return best || turfPoly;
          }
          return buff as any;
        } catch { return turfPoly; }
      })();

      try {
        const ring = (inset.geometry as any).coordinates[0] as [number, number][];
        const insetPoly = new maptalks.Polygon([ring.map(([x, y]) => new maptalks.Coordinate(x, y))], { symbol: setbackSymbol });
        // keep same altitude as segment surface
        const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
        const z = meters(feet);
        insetPoly.setProperties?.({ ...(insetPoly.getProperties?.() || {}), altitude: z });
        setbackLayer.addGeometry(insetPoly);
      } catch {}

      // If there is no module selected, skip placement
      const moduleId = segment.module as string | null;
      if (!moduleId) return;
      const dims = moduleDims[moduleId];
      if (!dims) return; // will render after dims load

  const isPortrait = (segment.defaultOrientation || 'Landscape') === 'Portrait';
  const moduleW = Math.max(0, isPortrait ? dims.height : dims.width);
  const moduleH = Math.max(0, isPortrait ? dims.width : dims.height);
  const moduleSpacing = (() => {
    const msFtRaw = Number((segment as any).moduleSpacing);
    const msFt = isFinite(msFtRaw) && msFtRaw > 0 ? msFtRaw : 0.02; // DEFAULT_GAP (ft)
    return Math.max(0, meters(msFt));
  })();
  const frameSpacing = Math.max(0, meters(Number(segment.frameSpacing ?? 0) || 0));
  const rowSpacing = Math.max(0, meters(Number(segment.rowSpacing ?? 0) || 0));
  const sizeWide = Math.max(1, Math.floor(Number(segment.frameSizeWide ?? 1)));
  const sizeUp = Math.max(1, Math.floor(Number(segment.frameSizeUp ?? 1)));
  const moduleAz = Math.max(0, ((Number(segment.moduleAzimuth ?? 0) % 360) + 360) % 360);
  // Local axes bearings
  const bearingY = moduleAz; // along module height (azimuth)
  const bearingX = (moduleAz + 90) % 360; // across rows
  const frameW = sizeWide * moduleW + (sizeWide - 1) * moduleSpacing;
  const frameH = sizeUp * moduleH + (sizeUp - 1) * moduleSpacing;
  const stepX = frameW + frameSpacing;
  const stepY = frameH + rowSpacing;

      // Compute oriented extents in local coordinates (bearingX, bearingY)
      const origin = turf.centroid(inset);
      const ringCoords = ((inset.geometry as any).coordinates?.[0] || []) as [number, number][];
      let minProjX = Infinity, maxProjX = -Infinity, minProjY = Infinity, maxProjY = -Infinity;
      const toRad = Math.PI / 180;
      for (const [px, py] of ringCoords) {
        const p = turf.point([px, py]);
        const d = turf.distance(origin, p);
        const br = turf.bearing(origin, p);
        const dx = d * Math.cos((br - bearingX) * toRad);
        const dy = d * Math.cos((br - bearingY) * toRad);
        if (dx < minProjX) minProjX = dx;
        if (dx > maxProjX) maxProjX = dx;
        if (dy < minProjY) minProjY = dy;
        if (dy > maxProjY) maxProjY = dy;
      }
      const widthM = Math.max(0, maxProjX - minProjX);
      const heightM = Math.max(0, maxProjY - minProjY);
      const shift = (pt: any, dist: number, brg: number) => turf.destination(pt, Math.abs(dist), dist >= 0 ? brg : (brg + 180) % 360, { units: 'meters' });
      const southWest = shift(shift(origin, minProjY, bearingY), minProjX, bearingX);

      // Start alignment across X using bbox width (approximate)
      const leftoverX = Math.max(0, widthM - frameW);
      let marginX = 0;
      const align = (segment.alignment || 'center');
      if (align === 'center') marginX = (leftoverX % stepX) / 2;
      else if (align === 'right') marginX = (leftoverX % stepX);
      else if (align === 'justify') marginX = (leftoverX % stepX) / 2;

      const startNorth = frameH / 2;
      const startEast = marginX + frameW / 2;

      for (let yOff = startNorth; yOff <= heightM - frameH / 2 + 1e-6; yOff += stepY) {
        const frameRowBase = turf.destination(southWest, yOff, bearingY, { units: 'meters' });
        for (let xOff = startEast; xOff <= widthM - frameW / 2 + 1e-6; xOff += stepX) {
          const frameCenter = turf.destination(frameRowBase, xOff, bearingX, { units: 'meters' });
          // top-left of frame
          const frameTopLeft = turf.destination(
            turf.destination(frameCenter, frameW / 2, (bearingX + 180) % 360, { units: 'meters' }),
            frameH / 2, bearingY, { units: 'meters' }
          );
          for (let r = 0; r < sizeUp; r++) {
            for (let c = 0; c < sizeWide; c++) {
              const xIn = c * (moduleW + moduleSpacing) + moduleW / 2;
              const yIn = r * (moduleH + moduleSpacing) + moduleH / 2;
              const alongX = turf.destination(frameTopLeft, xIn, bearingX, { units: 'meters' });
              const center = turf.destination(alongX, yIn, (bearingY + 180) % 360, { units: 'meters' });
              const rect = buildRotatedRect(center, moduleW / 2, moduleH / 2, bearingX, bearingY);
              try {
                if (turf.booleanWithin(rect, inset as any)) {
                  const coords = (rect.geometry.coordinates[0] as [number, number][]).map(([x, y]) => new maptalks.Coordinate(x, y));
                  const mpoly = new maptalks.Polygon([coords], { symbol: moduleSymbol });
                  const feet = (segment as any).surfaceHeight ?? (segment as any).surface_height ?? 0;
                  mpoly.setProperties?.({ ...(mpoly.getProperties?.() || {}), altitude: meters(feet) });
                  modulesLayer.addGeometry(mpoly);
                }
              } catch {}
            }
          }
        }
      }
    });
  }, [fieldSegments, moduleDims, meters, toTurfPolygon]);

  const clearCurrentShape = () => {
    if (drawToolRef.current) (drawToolRef.current as any).endDraw?.();
  };

  const handleDeleteSegment = async (segmentId: string) => {
    const originalSegments = [...fieldSegments];
    setFieldSegments(prev => prev.filter(s => s.id !== segmentId));
    setSelectedSegmentId(null);
    const { error } = await supabase.from('field_segments').delete().eq('id', segmentId);
    if (error) {
      console.error("Error deleting segment:", error);
      setFieldSegments(originalSegments);
    }
  };

  const handleUpdateSegment = (id: string, data: Partial<FieldSegment>) => {
    setFieldSegments(prev => prev.map(seg => seg.id === id ? { ...seg, ...data } : seg));
  };

  const selectedSegment = fieldSegments.find(s => s.id === selectedSegmentId);

  // Debounced auto-save effect
  useEffect(() => {
    if (!selectedSegment) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    
    setSavingStatus('saving');

    debounceTimeoutRef.current = setTimeout(async () => {
      const { id, created_at, updated_at, design_id, geometry, area, ...rest } = selectedSegment;
      const payload = {
          description: rest.description,
          module: rest.module,
          racking: rest.racking,
          surface_height: rest.surfaceHeight,
          racking_height: rest.rackingHeight,
          parapet_height: rest.parapetHeight,
          module_azimuth: rest.moduleAzimuth,
          module_tilt: rest.moduleTilt,
          span_rise: rest.spanRise,
          gcr: rest.gcr,
          time_of_day: rest.timeOfDay,
          analysis_date: rest.analysisDate,
          start_time: rest.startTime,
          end_time: rest.endTime,
          frame_size_up: rest.frameSizeUp,
          frame_size_wide: rest.frameSizeWide,
          default_orientation: rest.defaultOrientation,
          row_spacing: rest.rowSpacing,
          module_spacing: rest.moduleSpacing,
          frame_spacing: rest.frameSpacing,
          setback: rest.setback,
          alignment: rest.alignment
      };

      const stripSun = (obj: any) => {
        const { span_rise, gcr, time_of_day, analysis_date, start_time, end_time, parapet_height, ...rest } = obj || {};
        return rest;
      };

      let updErr: any = null;
      let res: any = await supabase.from('field_segments').update(payload).eq('id', selectedSegment.id);
      updErr = (res as any).error;
      if (updErr && String(updErr.message || updErr.details || '').toLowerCase().includes('column')) {
        res = await supabase.from('field_segments').update(stripSun(payload)).eq('id', selectedSegment.id);
        updErr = (res as any).error;
      }
      if (updErr) {
  console.error("Error updating segment:", updErr);
        setSavingStatus('error');
      } else {
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      }
    }, 1500);

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [selectedSegment]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawTool = drawToolRef.current;
    const segmentLayer = segmentLayerRef.current;
    if (!map || !drawTool || !segmentLayer) return;
    const handleDeleteClick = (e: any) => handleDeleteSegment(e.target.getId());
    if (activeTool === 'draw' && !isCtrlDown) {
      map.getContainer().style.cursor = 'crosshair';
      map.on('mousemove', handleMouseMove);
      drawTool.setMode('Polygon').enable();
    }
    // Attach edit handlers to existing polygons
    segmentLayer.getGeometries().forEach((geom: any) => {
      geom.off('editend');
      geom.off('shapechange');
      if (isEditingShape && geom.getId && geom.getId() === selectedSegmentId) {
        try {
          geom.startEdit({ vertexSymbol: { markerType: 'ellipse', markerFill: '#22c55e', markerLineColor: '#065f46', markerLineWidth: 2, markerWidth: 10, markerHeight: 10 } });
        } catch {}
        geom.on('shapechange', () => {
          try { updateDistanceLabels(geom, selectedSegmentId!); } catch {}
        });
        geom.on('editend', async () => {
          try { updateDistanceLabels(geom, selectedSegmentId!); } catch {}
          const updatedGeometry = geom.toJSON();
          const updatedArea = geom.getArea?.() || 0;
          setFieldSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, geometry: updatedGeometry, area: updatedArea } : s));
          try { await supabase.from('field_segments').update({ geometry: updatedGeometry, area: updatedArea }).eq('id', selectedSegmentId); } catch {}
        });
      } else {
        try { if (geom.isEditing()) geom.endEdit(); } catch {}
      }
    });
    return () => {
      drawTool.disable();
      map.off('mousemove', handleMouseMove);
      if (map.getContainer()) map.getContainer().style.cursor = 'grab';
      segmentLayer.getGeometries().forEach((geom: any) => {
        if (geom.isEditing()) geom.endEdit();
        geom.off('click', handleDeleteClick);
        geom.off('editend');
      });
      if (ghostMarkerRef.current) ghostMarkerRef.current.remove();
      clearCurrentShape();
    };
  }, [activeTool, isCtrlDown, handleMouseMove, isEditingShape, selectedSegmentId, updateDistanceLabels]);

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  const renderSavingStatus = () => {
    switch(savingStatus) {
      case 'saving': return <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></>;
      case 'saved': return <><Check className="w-4 h-4" /><span>Saved</span></>;
      case 'error': return <span className="text-red-500">Error</span>;
      default: return null;
    }
  };

  const renderSidebarContent = () => {
    if (activeSidebarTab === 'mechanical') {
      return (
        <>
          {/* Field Segment Shadows Toggle */}
          <div className="mb-3">
            <label htmlFor="toggle-shadows" className="inline-flex items-center space-x-2 text-sm text-gray-800">
              <input
                id="toggle-shadows"
                type="checkbox"
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                checked={showShadows}
                onChange={(e) => setShowShadows(e.target.checked)}
              />
              <span>Field Segment Shadows</span>
            </label>
          </div>

          {activeTool === 'draw' ? (
            <CreateFieldSegmentPanel 
              onBack={() => setActiveTool('none')} 
              onClear={clearCurrentShape} 
              area={currentArea}
              isSaving={isSavingNewSegment}
            />
          ) : selectedSegment ? (
            <FieldSegmentPanel
              segment={selectedSegment}
              onBack={() => setSelectedSegmentId(null)}
              onDelete={handleDeleteSegment}
              onUpdate={handleUpdateSegment}
              isEditing={isEditingShape}
              onStartEdit={beginEditSelected}
              onStopEdit={endEditSelected}
              moduleOptions={modules.map(m => ({ value: m.id, label: `${m.manufacturer} ${m.model}` }))}
            />
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">Field Segments</h3>
                <button onClick={() => setActiveTool('draw')} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
              </div>
              <div className="border-t pt-4">
                {isLoading ? (
                  <div className="text-center py-6 text-sm text-gray-500">Loading...</div>
                ) : fieldSegments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    <a href="#" onClick={(e) => { e.preventDefault(); setActiveTool('draw'); }} className="text-blue-600 hover:underline">Add a field segment</a> to get started
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldSegments.map((seg) => (
                      <div 
                        key={seg.id} 
                        onClick={() => setSelectedSegmentId(seg.id)}
                        className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer"
                      >
                        <span>{seg.description}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSegment(seg.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-red-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      );
    } else if (activeSidebarTab === 'keepouts') {
      return (
        <>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-800">Keepouts</h3>
            <div className="flex space-x-2"> {/* Added a div to group buttons */}
              <button onClick={() => alert('Add Keepout functionality coming soon!')} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                <Plus className="w-4 h-4" />
                <span>Keepout</span>
              </button>
              <button onClick={() => alert('Add Tree functionality coming soon!')} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                <Plus className="w-4 h-4" />
                <span>Tree</span>
              </button>
            </div>
          </div>
          <div className="border-t pt-4">
            <div className="text-center py-6 text-sm text-gray-500">
              <a href="#" onClick={(e) => { e.preventDefault(); alert('Add Keepout functionality coming soon!'); }} className="text-blue-600 hover:underline">Add a keepout</a> to get started
            </div>
          </div>
        </>
      );
    } else {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium mb-2">Coming soon!</p>
          <p className="text-sm">This section is under development.</p>
        </div>
      );
    }
  };

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      <div className="w-80 bg-white shadow-2xl flex flex-col z-20">
        {/* Sidebar header - always visible */}
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-gray-800">{design.name}</h2>
            <button className="p-1 text-gray-500 hover:text-gray-800"><Settings className="w-5 h-5" /></button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-1 text-gray-500 h-5">{renderSavingStatus()}</div>
            <div className="flex items-center space-x-2">
              <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-4 h-4" /></button>
              <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCw className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Tabs - always visible */}
        <div className="p-4 border-b">
          <div className="grid grid-cols-2 gap-2">
            {sidebarTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveSidebarTab(tab.id)} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${activeSidebarTab === tab.id ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100'}`}>
                <tab.icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body switches between create, edit, and list */}
        <div className="flex-grow p-4 overflow-y-auto">
          {renderSidebarContent()}
        </div>

        {/* Footer - always visible */}
        <div className="p-4 border-t text-sm text-gray-600 font-medium">
          0 Modules, 0 p
        </div>
      </div>
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2 z-10">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;