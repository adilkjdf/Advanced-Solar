import React, { useState, useCallback } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { MapPin, Map as MapIcon, Satellite } from 'lucide-react';

interface MapSectionProps {
  address: string;
  coordinates?: { lat: number; lng: number };
  onLocationSelect: (lat: number, lng: number) => void;
  onAddressGeocode: (address: string) => Promise<{ lat: number; lng: number } | null>;
}

const satelliteStyle = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
const standardStyle = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

const createRasterStyle = (url: string, sourceName: string) => ({
  version: 8,
  sources: {
    [sourceName]: {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      attribution: '&copy; Google Maps',
    },
  },
  layers: [
    {
      id: 'raster-layer',
      type: 'raster',
      source: sourceName,
      minzoom: 0,
      maxzoom: 22,
    },
  ],
});

const MapSection: React.FC<MapSectionProps> = ({
  address,
  coordinates,
  onLocationSelect,
  onAddressGeocode,
}) => {
  const [mapType, setMapType] = useState<'satellite' | 'standard'>('satellite');
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: coordinates?.lng || -122.4194,
    latitude: coordinates?.lat || 37.7749,
    zoom: coordinates ? 17 : 9,
  });

  const handleMapClick = (e: any) => {
    onLocationSelect(e.lngLat.lat, e.lngLat.lng);
  };

  const handleCenterOnAddress = async () => {
    if (!address.trim()) return;
    setIsLoading(true);
    try {
      const location = await onAddressGeocode(address);
      if (location) {
        onLocationSelect(location.lat, location.lng);
        setViewState({
          longitude: location.lng,
          latitude: location.lat,
          zoom: 17,
        });
      }
    } catch (error) {
      console.error('Geocoding failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const mapStyle = mapType === 'satellite' 
    ? createRasterStyle(satelliteStyle, 'google-satellite')
    : createRasterStyle(standardStyle, 'google-standard');

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-orange-500" />
            Project Location
          </h3>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setMapType('standard')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center ${mapType === 'standard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <MapIcon className="w-4 h-4 mr-1" /> Map
            </button>
            <button onClick={() => setMapType('satellite')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center ${mapType === 'satellite' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <Satellite className="w-4 h-4 mr-1" /> Satellite
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-600 mb-3">
          Click on the map to select your project location or use the button below.
        </div>
        <button onClick={handleCenterOnAddress} disabled={!address.trim() || isLoading} className="w-full sm:w-auto px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium">
          {isLoading ? 'Locating...' : 'Center Map on Address'}
        </button>
      </div>
      <div className="relative h-96">
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
          mapLib={maplibregl}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
        >
          <NavigationControl position="top-right" />
          {coordinates && <Marker longitude={coordinates.lng} latitude={coordinates.lat} />}
        </Map>
      </div>
    </div>
  );
};

export default MapSection;