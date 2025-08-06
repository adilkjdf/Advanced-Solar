import React, { useEffect, useRef, useState } from 'react';
import * as maptalks from 'maptalks';
import { ThreeLayer } from 'maptalks.three';
import * as THREE from 'three';
import { ProjectData, Design, FieldSegment } from '../types/project';
import { ArrowLeft, Check, RotateCcw, RotateCw, Settings, LayoutGrid, Crosshair, GitBranch, PlusCircle, Plus } from 'lucide-react';
import { formatDistance, formatArea } from '../utils/mapUtils';
import CreateFieldSegmentPanel from './CreateFieldSegmentPanel';

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);
  const [activeTab, setActiveTab] = useState('mechanical');
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [fieldSegments, setFieldSegments] = useState<FieldSegment[]>([]);
  const [currentArea, setCurrentArea] = useState('0.0 ft²');

  const drawToolRef = useRef<maptalks.DrawTool | null>(null);
  const segmentLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const labelLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const isClosingHintShownRef = useRef(false);

  const defaultSymbol = {
    lineColor: '#f97316', // Orange
    lineWidth: 3,
    polygonFill: '#f97316',
    polygonOpacity: 0.3,
  };

  const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' }; // Green

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && project.coordinates) {
      const map = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 19,
        pitch: 0,
        bearing: 0,
        dragRotate: true,
        baseLayer: new maptalks.TileLayer('base', {
          urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        }),
      });
      mapInstanceRef.current = map;

      segmentLayerRef.current = new maptalks.VectorLayer('fieldSegments').addTo(map);
      labelLayerRef.current = new maptalks.VectorLayer('labels').addTo(map);
      drawToolRef.current = new maptalks.DrawTool({ mode: 'Polygon' }).addTo(map);
      
      setupDrawingListeners();

      const threeLayer = new ThreeLayer('three', { forceRenderOnMoving: true, forceRenderOnRotating: true });
      threeLayer.prepareToDraw = (gl, scene) => {
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, -10, 10).normalize();
        scene.add(light);
      };
      map.addLayer(threeLayer);

      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }
  }, [project.coordinates]);

  const setupDrawingListeners = () => {
    const drawTool = drawToolRef.current;
    if (!drawTool) return;

    drawTool.on('drawstart', () => {
      labelLayerRef.current?.clear();
    });

    const handleDrawingProgress = (e: any) => {
      const geometry = drawTool.getCurrentGeometry();
      if (!geometry) return;

      const coordinates = geometry.getCoordinates();
      if (!coordinates || !coordinates[0]) {
        labelLayerRef.current?.clear();
        return;
      }
      
      const coords = coordinates[0];
      if (coords.length < 1) {
        labelLayerRef.current?.clear();
        return;
      }

      if (coords.length >= 2) {
          updateDistanceLabels(coords);
      } else {
          labelLayerRef.current?.clear();
      }
      updateClosingHint(e.coordinate, coords[0]);
      setCurrentArea(formatArea(geometry.getArea()));
    };

    drawTool.on('drawvertex', handleDrawingProgress);
    drawTool.on('mousemove', handleDrawingProgress);

    drawTool.on('drawend', (e: any) => {
      if (!e.geometry) return;
      const newSegment: FieldSegment = {
        id: new Date().toISOString(),
        geometry: e.geometry.toJSON(),
        area: e.geometry.getArea(),
      };
      setFieldSegments(prev => [...prev, newSegment]);
      segmentLayerRef.current?.addGeometry(e.geometry.copy().setSymbol(defaultSymbol));
      
      endDrawing();
    });
  };

  const updateDistanceLabels = (coords: maptalks.Coordinate[]) => {
    if (!mapInstanceRef.current) return;
    const projection = mapInstanceRef.current.getProjection();
    if (!projection) return;

    labelLayerRef.current?.clear();
    // Loop up to the second to last vertex to draw labels only for committed segments
    for (let i = 0; i < coords.length - 2; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const line = new maptalks.LineString([p1, p2]);
      const distance = line.getLength(projection);
      const midPoint = new maptalks.Coordinate( (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 );
      
      const label = new maptalks.Label(formatDistance(distance), midPoint, {
        boxStyle: {
          padding: [6, 4],
          symbol: {
            markerType: 'square',
            markerFill: '#000',
            markerFillOpacity: 0.8,
            markerLineWidth: 0,
          },
        },
        textSymbol: {
          textFill: '#fff',
          textSize: 12,
        },
      });
      labelLayerRef.current?.addGeometry(label);
    }
  };

  const updateClosingHint = (currentCoord: maptalks.Coordinate, firstCoord: maptalks.Coordinate) => {
    if (!mapInstanceRef.current || !currentCoord || !firstCoord) return;
    const projection = mapInstanceRef.current.getProjection();
    if (!projection) return;

    const line = new maptalks.LineString([currentCoord, firstCoord]);
    const distance = line.getLength(projection);
    const shouldShowHint = distance < 10; // 10 meters threshold

    if (shouldShowHint && !isClosingHintShownRef.current) {
      drawToolRef.current?.setSymbol(closingSymbol);
      isClosingHintShownRef.current = true;
    } else if (!shouldShowHint && isClosingHintShownRef.current) {
      drawToolRef.current?.setSymbol(defaultSymbol);
      isClosingHintShownRef.current = false;
    }
  };

  const startDrawing = () => {
    setIsDrawing(true);
    mapContainerRef.current?.style.setProperty('cursor', 'crosshair');
    drawToolRef.current?.setSymbol(defaultSymbol).enable();
  };

  const endDrawing = () => {
    setIsDrawing(false);
    mapContainerRef.current?.style.setProperty('cursor', 'grab');
    drawToolRef.current?.disable();
    labelLayerRef.current?.clear();
    setCurrentArea('0.0 ft²');
  };

  const clearCurrentShape = () => {
    drawToolRef.current?.clear();
    labelLayerRef.current?.clear();
    setCurrentArea('0.0 ft²');
  };

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      <div className="w-80 bg-white shadow-2xl flex flex-col z-10">
        {isDrawing ? (
          <CreateFieldSegmentPanel onBack={endDrawing} onClear={clearCurrentShape} area={currentArea} />
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
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100'}`}>
                    <tab.icon className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-grow p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">Field Segments</h3>
                <button onClick={startDrawing} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
              </div>
              <div className="border-t pt-4">
                {fieldSegments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    <a href="#" onClick={(e) => { e.preventDefault(); startDrawing(); }} className="text-blue-600 hover:underline">Add a field segment</a> to get started
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldSegments.map((seg, index) => (
                      <div key={seg.id} className="text-sm p-2 bg-gray-50 rounded-md">Field Segment {index + 1}</div>
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
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;