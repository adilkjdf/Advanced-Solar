import React, { useEffect, useRef, useState } from 'react';
import * as maptalks from 'maptalks';
import { ThreeLayer } from 'maptalks.three';
import * as THREE from 'three';
import { ProjectData, Design } from '../types/project';
import { ArrowLeft, Check, RotateCcw, RotateCw, Settings, LayoutGrid, Crosshair, GitBranch, PlusCircle, Plus } from 'lucide-react';

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);
  const [activeTab, setActiveTab] = useState('mechanical');

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && project.coordinates) {
      const map = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 19,
        pitch: 0, // Set to 0 for top-down view
        bearing: 0, // Set to 0 for North-up orientation
        dragRotate: true,
        baseLayer: new maptalks.TileLayer('base', {
          urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        }),
      });

      const threeLayer = new ThreeLayer('three', {
        forceRenderOnMoving: true,
        forceRenderOnRotating: true,
      });

      threeLayer.prepareToDraw = (gl, scene, camera) => {
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, -10, 10).normalize();
        scene.add(light);
        
        // Example: Add a simple cube to show 3D is working
        // In a real scenario, you would add solar panels, buildings, etc.
        const material = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), material);
        const position = map.getCenter();
        threeLayer.addMesh(cube, { coordinate: position });
      };
      
      map.addLayer(threeLayer);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [project.coordinates]);

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-2xl flex flex-col z-10">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-gray-800">{design.name}</h2>
            <button className="p-1 text-gray-500 hover:text-gray-800">
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-1 text-green-600">
              <Check className="w-4 h-4" />
              <span>Saved</span>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-4 h-4" /></button>
              <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCw className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="grid grid-cols-2 gap-2">
            {sidebarTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                  activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-grow p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-800">Field Segments</h3>
            <button className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>
          <div className="text-sm space-y-4">
            <label className="flex items-center space-x-2 text-gray-600">
              <input type="checkbox" className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
              <span>Field segments cast shadows</span>
            </label>
            <div className="border-t pt-4">
              <div className="grid grid-cols-3 gap-2 font-semibold text-gray-500 mb-2">
                <span>Description</span>
                <span>Modules</span>
                <span>Action</span>
              </div>
              <div className="text-center py-6">
                <p className="text-gray-500">
                  <a href="#" className="text-blue-600 hover:underline">Add a field segment</a> to get started
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t text-sm text-gray-600 font-medium">
          0 Modules, 0 p
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        <button
          onClick={onBack}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;