import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LatLngExpression, Map as LeafletMap } from 'leaflet';
import { MapPin, Map, Satellite } from 'lucide-react';

interface MapUpdaterProps {
  center: LatLngExpression;
  zoom: number;
}

const MapUpdater: React.FC<MapUpdaterProps> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

interface LocationSelectorProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({ onLocationSelect }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

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
  const [mapType, setMapType] = useState<'satellite' | 'standard'>('satellite');
  const [isLoading, setIsLoading] = useState(false);

  const defaultCenter: LatLngExpression = [37.7749, -122.4194];
  const mapCenter: LatLngExpression = coordinates ? [coordinates.lat, coordinates.lng] : defaultCenter;
  const zoom = coordinates ? 18 : 10;

  const satelliteUrl = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
  const standardUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  const attribution = '&copy; <a href="https://www.google.com/maps">Google Maps</a>';

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
          <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom={true} className="h-full w-full rounded-b-lg">
            <TileLayer
              attribution={attribution}
              url={mapType === 'satellite' ? satelliteUrl : standardUrl}
            />
            {coordinates && <Marker position={[coordinates.lat, coordinates.lng]} />}
            <MapUpdater center={mapCenter} zoom={zoom} />
            <LocationSelector onLocationSelect={onLocationSelect} />
          </MapContainer>
        </div>

        {coordinates && (
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-xs z-[1000]">
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