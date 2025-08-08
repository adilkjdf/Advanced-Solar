import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maptalks from 'maptalks';
import { ThreeLayer } from 'maptalks.three';
import * as THREE from 'three';
import { ProjectData, Design, FieldSegment } from '../types/project';
import { ArrowLeft, Check, RotateCcw, RotateCw, Settings, LayoutGrid, Crosshair, GitBranch, PlusCircle, Plus, Trash2 } from 'lucide-react';
import { formatArea, formatDistance } from '../utils/mapUtils';
import CreateFieldSegmentPanel from './CreateFieldSegmentPanel';
import MapDrawingTool from './MapDrawingTool';

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

type EditorTool = 'none' | 'draw' | 'edit' | 'delete';

const defaultSymbol = {
  lineColor: '#f97316',
  lineWidth: 3,
  polygonFill: '#f97316',
  polygonOpacity: 0.3,
};

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maptalks.Map | null>(null);
  const segmentLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const labelLayerRef = useRef<maptalks.VectorLayer | null>(null);
  
  const [activeSidebarTab, setActiveSidebarTab] = useState('mechanical');
  const [activeTool, setActiveTool] = useState<EditorTool>('none');
  
  const [fieldSegments, setFieldSegments] = useState<FieldSegment[]>([]);
  const [currentArea, setCurrentArea] = useState('0.0 ft²');

  const updateDistanceLabels = useCallback((geometry: maptalks.Polygon, segmentId: string) => {
    if (!geometry || !labelLayerRef.current) return;
    
    const oldLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
    if (oldLabels.length) {
      labelLayerRef.current.removeGeometry(oldLabels);
    }
  
    const coords = geometry.getCoordinates()[0];
    
    coords.forEach(coord => {
        const vertexMarker = new maptalks.Marker(coord, {
          symbol: { 'markerType': 'ellipse', 'markerFill': '#ffffff', 'markerWidth': 8, 'markerHeight': 8, 'markerLineWidth': 2, 'markerLineColor': '#f97316' }
        }).setProperties({ isVertex: true, segmentId: segmentId });
        labelLayerRef.current?.addGeometry(vertexMarker);
    });

    if (coords.length < 2) return;

    for (let i = 0; i < coords.length; i++) {
      const p1 = coords[i];
      const p2 = coords[(i + 1) % coords.length]; // Wrap around for the last segment
      const line = new maptalks.LineString([p1, p2]);
      const label = new maptalks.Label(formatDistance(line.getLength()), line.getCenter(), {
        'textPlacement' : 'line', 'textDy': -15,
        'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
        'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
      });
      label.setProperties({ isDistanceLabel: true, segmentId: segmentId });
      labelLayerRef.current.addGeometry(label);
    }
  }, []);

  useEffect(() => {
    if (mapContainerRef.current && !map && project.coordinates) {
      const mapInstance = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 19, pitch: 0, bearing: 0, dragRotate: true,
        baseLayer: new maptalks.TileLayer('base', { urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' }),
      });
      setMap(mapInstance);
      segmentLayerRef.current = new maptalks.VectorLayer('fieldSegments').addTo(mapInstance);
      labelLayerRef.current = new maptalks.VectorLayer('labels').addTo(mapInstance);
      
      const threeLayer = new ThreeLayer('three', { forceRenderOnMoving: true, forceRenderOnRotating: true });
      threeLayer.prepareToDraw = (gl, scene) => {
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, -10, 10).normalize();
        scene.add(light);
      };
      mapInstance.addLayer(threeLayer);
      
      return () => {
        mapInstance.remove();
        setMap(null);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.coordinates]);

  const handleCreateSegment = useCallback((segment: FieldSegment) => {
    const polygon = maptalks.Geometry.fromJSON(segment.geometry) as maptalks.Polygon;
    polygon.setSymbol(defaultSymbol).setId(segment.id);
    segmentLayerRef.current?.addGeometry(polygon);
    updateDistanceLabels(polygon, segment.id);
    setFieldSegments(prev => [...prev, segment]);
    setActiveTool('none');
  }, [updateDistanceLabels]);

  const handleDrawingUpdate = useCallback(({ area }: { area: string }) => {
    setCurrentArea(area);
  }, []);

  const handleDrawingCancel = useCallback(() => {
    setActiveTool('none');
  }, []);

  const clearCurrentShape = () => {
    setCurrentArea('0.0 ft²');
  };

  const handleDeleteSegment = (segmentId: string) => {
    const segmentLayer = segmentLayerRef.current;
    if (segmentLayer) {
      const geometryToRemove = segmentLayer.getGeometryById(segmentId);
      if (geometryToRemove) geometryToRemove.remove();
    }
    if (labelLayerRef.current) {
        const labelsToRemove = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
        labelLayerRef.current.removeGeometry(labelsToRemove);
    }
    setFieldSegments(prev => prev.filter(s => s.id !== segmentId));
  };

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      <div className="w-80 bg-white shadow-2xl flex flex-col z-20">
        {activeTool === 'draw' ? (
          <CreateFieldSegmentPanel onBack={() => setActiveTool('none')} onClear={clearCurrentShape} area={currentArea} />
        ) : (
          <>
            <div className="p-4 border-b">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-gray-800">{design.name}</h2>
                <button className="p-1 text-gray-500 hover:text-gray-800"><Settings className="w-5 h-5" /></button>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-1 text-green-600"><Check className="w-4 h-4" /><span>Saved</span></div>
                <div className="flex items-center space-x-2">
                  <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-4 h-4" /></button>
                  <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCw className="w-4 h-4" /></button>
                </div>
              </div>
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
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">Field Segments</h3>
                <button onClick={() => setActiveTool('draw')} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
              </div>
              <div className="border-t pt-4">
                {fieldSegments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    <a href="#" onClick={(e) => { e.preventDefault(); setActiveTool('draw'); }} className="text-blue-600 hover:underline">Add a field segment</a> to get started
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldSegments.map((seg, index) => (
                      <div key={seg.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-md hover:bg-gray-100">
                        <span>Field Segment {index + 1}</span>
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
              0 Modules, 0 p
            </div>
          </>
        )}
      </div>
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        <MapDrawingTool
          map={map}
          enabled={activeTool === 'draw'}
          onCreate={handleCreateSegment}
          onUpdate={handleDrawingUpdate}
          onCancel={handleDrawingCancel}
        />
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2 z-10">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;