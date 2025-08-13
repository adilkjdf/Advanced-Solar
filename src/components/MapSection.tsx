import React, { useEffect, useRef, useState } from 'react';
import * as maptalks from 'maptalks';
import { MapPin, Map, Satellite } from 'lucide-react';

interface MapSectionProps {
  address: string;
  coordinates?: { lat: number; lng: number };
  onLocationSelect: (lat: number, lng: number) => void;
  onAddressGeocode: (address: string) => Promise<{ lat: number; lng: number } | null>;
}

const MapSection: React.FC<MapSectionProps> = ({
  address,
  coordinates,
  onLocationSelect,
  onAddressGeocode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);
  const markerRef = useRef<maptalks.Marker | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'standard'>('satellite');
  const [isLoading, setIsLoading] = useState(false);

  // Default center (San Francisco Bay Area)
  const defaultCenter: [number, number] = [37.7749, -122.4194];
  
  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      const mapCenter: [number, number] = coordinates
        ? [coordinates.lng, coordinates.lat]
        : [defaultCenter[1], defaultCenter[0]];

      const map = new maptalks.Map(mapContainerRef.current, {
        center: mapCenter,
        zoom: coordinates ? 18 : 10,
        pitch: 0,
        bearing: 0,
        baseLayer: new maptalks.TileLayer('base', {
          urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        }),
      });

      map.on('click', (e: any) => {
        onLocationSelect(e.coordinate.y, e.coordinate.x);
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run only once

  // Update map center when coordinates change
  useEffect(() => {
    if (mapInstanceRef.current && coordinates) {
      mapInstanceRef.current.animateTo(
        {
          center: [coordinates.lng, coordinates.lat],
          zoom: 18,
        },
        {
          duration: 1000,
        }
      );
    }
  }, [coordinates]);

  // Update marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const { VectorLayer, Marker } = maptalks;
    let layer = mapInstanceRef.current.getLayer('markerLayer') as maptalks.VectorLayer;

    if (coordinates) {
      if (!layer) {
        layer = new VectorLayer('markerLayer').addTo(mapInstanceRef.current);
      }
      
      if (markerRef.current) {
        markerRef.current.setCoordinates([coordinates.lng, coordinates.lat]);
      } else {
        markerRef.current = new Marker([coordinates.lng, coordinates.lat]);
        layer.addGeometry(markerRef.current);
      }
    } else {
      if (layer) {
        layer.clear();
      }
      if (markerRef.current) {
        markerRef.current = null;
      }
    }
  }, [coordinates]);

  // Handle map type change
  useEffect(() => {
    if (mapInstanceRef.current) {
      const urlTemplate =
        mapType === 'satellite'
          ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
          : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

      const newBaseLayer = new maptalks.TileLayer('base', {
        urlTemplate,
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
      });
      mapInstanceRef.current.setBaseLayer(newBaseLayer);
    }
  }, [mapType]);

  const handleCenterOnAddress = async () => {
    if (!address.trim()) return;

    setIsLoading(true);
    try {
      const location = await onAddressGeocode(address);
      if (location) {
        onLocationSelect(location.lat, location.lng);
      }
    } catch (error) {
      console.error('Geocoding failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-orange-500" />
            Project Location
          </h3>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setMapType('standard')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center ${
                mapType === 'standard'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Map className="w-4 h-4 mr-1" />
              Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center ${
                mapType === 'satellite'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Satellite className="w-4 h-4 mr-1" />
              Satellite
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-3">
          Click on the map to select your project location or use the button below to center on the address.
        </div>

        <button
          onClick={handleCenterOnAddress}
          disabled={!address.trim() || isLoading}
          className="w-full sm:w-auto px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 
                     disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {isLoading ? 'Locating...' : 'Center Map on Address'}
        </button>
      </div>

      <div className="relative">
        <div className="h-80 sm:h-96">
          <div ref={mapContainerRef} className="h-full w-full rounded-b-lg" />
        </div>

        {coordinates && (
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-xs">
            <div className="font-medium text-gray-800">Selected Location:</div>
            <div className="text-gray-600">
              {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapSection;