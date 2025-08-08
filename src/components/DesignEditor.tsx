import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet-draw';
import { ProjectData, Design, FieldSegment } from '../types/project';
import { ArrowLeft, Settings, Trash2, LayoutGrid, Crosshair, GitBranch, PlusCircle } from 'lucide-react';
import * as turf from '@turf/turf';
import { formatArea } from '../utils/mapUtils';

// Deleting a polygon from the map is buggy in leaflet-draw, this is a workaround
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const [fieldSegments, setFieldSegments] = useState<FieldSegment[]>([]);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState('mechanical');

  const handleCreate = (e: any) => {
    const { layerType, layer } = e;
    if (layerType === 'polygon') {
      const geoJSON = layer.toGeoJSON();
      const newSegment: FieldSegment = {
        id: L.Util.stamp(layer), // Use Leaflet's internal ID
        geometry: geoJSON.geometry,
        area: turf.area(geoJSON),
      };
      setFieldSegments(prev => [...prev, newSegment]);
    }
  };

  const handleEdit = (e: any) => {
    const { layers } = e;
    layers.eachLayer((layer: any) => {
      const geoJSON = layer.toGeoJSON();
      const segmentId = L.Util.stamp(layer);
      setFieldSegments(prev => prev.map(seg => 
        seg.id === segmentId 
          ? { ...seg, geometry: geoJSON.geometry, area: turf.area(geoJSON) }
          : seg
      ));
    });
  };

  const handleDelete = (e: any) => {
    const { layers } = e;
    const deletedIds = Object.keys(layers._layers).map(id => parseInt(id, 10));
    setFieldSegments(prev => prev.filter(seg => !deletedIds.includes(Number(seg.id))));
  };
  
  const handleDeleteSegment = (segmentId: string) => {
    if (featureGroupRef.current) {
      const layerToDelete = Object.values(featureGroupRef.current.getLayers()).find(
        (layer: any) => L.Util.stamp(layer) === Number(segmentId)
      );
      if (layerToDelete) {
        featureGroupRef.current.removeLayer(layerToDelete);
        setFieldSegments(prev => prev.filter(seg => seg.id !== segmentId));
      }
    }
  };

  const mapCenter: LatLngExpression = project.coordinates
    ? [project.coordinates.lat, project.coordinates.lng]
    : [37.7749, -122.4194];

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

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
        <MapContainer center={mapCenter} zoom={19} className="w-full h-full">
          <TileLayer
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            attribution="&copy; Google Maps"
          />
          <FeatureGroup ref={featureGroupRef}>
            <EditControl
              position="topright"
              onCreated={handleCreate}
              onEdited={handleEdit}
              onDeleted={handleDelete}
              draw={{
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
                polygon: {
                  allowIntersection: false,
                  shapeOptions: {
                    color: '#f97316',
                    weight: 3,
                  },
                },
              }}
            />
          </FeatureGroup>
        </MapContainer>
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2 z-[1000]">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;