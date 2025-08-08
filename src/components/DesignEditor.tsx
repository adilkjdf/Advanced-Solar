import React, { useState, useCallback } from 'react';
import Map, { useControl, NavigationControl, ScaleControl } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { ProjectData, Design, FieldSegment } from '../types/project';
import { ArrowLeft, Trash2, LayoutGrid, Crosshair, GitBranch, PlusCircle } from 'lucide-react';
import * as turf from '@turf/turf';
import { formatArea } from '../utils/mapUtils';

// --- DrawControl Component ---
// This component integrates mapbox-gl-draw with react-map-gl
type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onCreate?: (evt: { features: any[] }) => void;
  onUpdate?: (evt: { features: any[]; action: string }) => void;
  onDelete?: (evt: { features: any[] }) => void;
};

function DrawControl(props: DrawControlProps) {
  useControl<MapboxDraw>(
    () => new MapboxDraw(props),
    ({ map }) => {
      map.on('draw.create', props.onCreate!);
      map.on('draw.update', props.onUpdate!);
      map.on('draw.delete', props.onDelete!);
    },
    ({ map }) => {
      map.off('draw.create', props.onCreate!);
      map.off('draw.update', props.onUpdate!);
      map.off('draw.delete', props.onDelete!);
    },
    { position: props.position }
  );
  return null;
}

// --- Main DesignEditor Component ---
interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [activeSidebarTab, setActiveSidebarTab] = useState('mechanical');

  const onUpdate = useCallback((e: { features: any[] }) => {
    setFeatures(prev => {
      const newFeatures = { ...prev };
      for (const f of e.features) {
        newFeatures[f.id] = f;
      }
      return newFeatures;
    });
  }, []);

  const onDelete = useCallback((e: { features: any[] }) => {
    setFeatures(prev => {
      const newFeatures = { ...prev };
      for (const f of e.features) {
        delete newFeatures[f.id];
      }
      return newFeatures;
    });
  }, []);

  const fieldSegments: FieldSegment[] = Object.values(features).map(f => ({
    id: f.id,
    geometry: f.geometry,
    area: turf.area(f),
  }));

  const handleDeleteSegment = (segmentId: string) => {
    // This will be handled by the draw control's delete button
    // We can keep this function if we want to delete from the sidebar
    const newFeatures = { ...features };
    delete newFeatures[segmentId];
    setFeatures(newFeatures);
  };

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  const initialViewState = {
    longitude: project.coordinates?.lng || -122.4194,
    latitude: project.coordinates?.lat || 37.7749,
    zoom: 18,
    pitch: 45,
    bearing: 0,
  };

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      <div className="w-80 bg-white shadow-2xl flex flex-col z-20">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800 mb-2">{design.name}</h2>
        </div>
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
        <div className="flex-grow p-4 overflow-y-auto">
          <h3 className="font-bold text-gray-800 mb-3">Field Segments</h3>
          <div className="border-t pt-4">
            {fieldSegments.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                Use the drawing tools on the map to add a field segment.
              </div>
            ) : (
              <div className="space-y-2">
                {fieldSegments.map((seg, index) => (
                  <div key={seg.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-md hover:bg-gray-100">
                    <div>
                      <span className="font-semibold">Field Segment {index + 1}</span>
                      <div className="text-xs text-gray-500">Area: {formatArea(seg.area)}</div>
                    </div>
                    <button onClick={() => handleDeleteSegment(seg.id)} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-red-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t text-sm text-gray-600 font-medium">
          {fieldSegments.length} Segments
        </div>
      </div>
      <div className="flex-1 relative">
        <Map
          initialViewState={initialViewState}
          mapLib={maplibregl}
          style={{ width: '100%', height: '100%' }}
          mapStyle={{
            version: 8,
            sources: { 'google-satellite': { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize: 256 } },
            layers: [{ id: 'raster-layer', type: 'raster', source: 'google-satellite' }]
          }}
        >
          <NavigationControl position="top-right" />
          <ScaleControl />
          <DrawControl
            position="top-right"
            displayControlsDefault={false}
            controls={{ polygon: true, trash: true }}
            onCreate={onUpdate}
            onUpdate={onUpdate}
            onDelete={onDelete}
            defaultMode="draw_polygon"
            styles={[
              // ACTIVE (being drawn)
              {
                id: 'gl-draw-polygon-fill-active',
                type: 'fill',
                filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
                paint: { 'fill-color': '#f97316', 'fill-opacity': 0.1 }
              },
              {
                id: 'gl-draw-polygon-stroke-active',
                type: 'line',
                filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#f97316', 'line-width': 3 }
              },
              // INACTIVE
              {
                id: 'gl-draw-polygon-fill-inactive',
                type: 'fill',
                filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']],
                paint: { 'fill-color': '#f97316', 'fill-opacity': 0.1 }
              },
              {
                id: 'gl-draw-polygon-stroke-inactive',
                type: 'line',
                filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#f97316', 'line-width': 3 }
              },
            ]}
          />
        </Map>
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2 z-10">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;