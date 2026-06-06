import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';
import { MapPin, Heart } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'patient' | 'donor';
  status?: string;
  distance_km?: number;
}

interface ProximityMapProps {
  patient: { lat: number; lng: number; city?: string };
  donors: MapPoint[];
}

// Map Controller to Auto-Center on Markers
function MapController({ center, bounds }: { center: [number, number]; bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else {
      map.setView(center, 12);
    }
  }, [center, bounds, map]);
  return null;
}

// Leaflet Icons using Tailwind CSS classes
const patientIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(to bottom right, #ef4444, #be123c); border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.5); display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const confirmedDonorIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(to bottom right, #34d399, #059669); border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const defaultDonorIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(to bottom right, #60a5fa, #4f46e5); border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.5); display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export function ProximityMap({ patient, donors }: ProximityMapProps) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  // Compute map bounds when donors change
  useEffect(() => {
    if (patient.lat && patient.lng) {
      const b = L.latLngBounds([[patient.lat, patient.lng]]);
      donors.forEach(d => {
        if (d.lat && d.lng) {
          b.extend([d.lat, d.lng]);
        }
      });
      // Add slight padding to prevent edges cutting off
      setBounds(b);
    }
  }, [patient, donors]);

  // Leaflet requires valid numbers. Fallbacks are required.
  const center: [number, number] = [patient.lat || 0, patient.lng || 0];

  return (
    <Card className="border-0 shadow-xl overflow-hidden bg-slate-900 text-white relative h-[400px]">
      <CardHeader className="pb-2 relative z-10 border-b border-white/10 bg-black/20 backdrop-blur-sm absolute w-full top-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-400" />
            Live Proximity Map
          </CardTitle>
          <Badge className="bg-white/10 text-white hover:bg-white/20 border-0">
            {donors.length} Matches Found
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full w-full relative">
        {patient.lat === 0 && patient.lng === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <MapPin className="w-12 h-12 mb-3 opacity-20" />
            <p>Location data unavailable.</p>
          </div>
        ) : (
          <MapContainer 
            center={center} 
            zoom={12} 
            style={{ height: '100%', width: '100%', zIndex: 0 }}
            zoomControl={true}
            scrollWheelZoom={true}
          >
            {/* Beautiful dark map tiles */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            
            <MapController center={center} bounds={bounds} />

            {/* Patient Marker */}
            <Marker position={center} icon={patientIcon} zIndexOffset={1000}>
              <Popup className="custom-popup">
                <div className="font-sans">
                  <p className="font-bold text-gray-900 mb-1 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-500" /> Patient
                  </p>
                  <p className="text-xs text-gray-600">{patient.city || 'Current Location'}</p>
                </div>
              </Popup>
            </Marker>

            {/* Donor Markers */}
            {donors.map((donor) => {
              if (!donor.lat || !donor.lng) return null;
              const isConfirmed = donor.status === 'confirmed';
              return (
                <Marker 
                  key={donor.id} 
                  position={[donor.lat, donor.lng]} 
                  icon={isConfirmed ? confirmedDonorIcon : defaultDonorIcon}
                >
                  <Popup>
                    <div className="font-sans min-w-[120px]">
                      <p className="font-bold text-gray-900">{donor.name || 'Anonymous'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-200 text-blue-600">
                          {donor.distance_km?.toFixed(1) || '?'} km
                        </Badge>
                        <span className={`text-[10px] font-medium uppercase ${isConfirmed ? 'text-green-600' : 'text-slate-500'}`}>
                          {donor.status}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
        
        {/* Radar Scanner Overlay */}
        <div className="absolute inset-0 z-[1000] pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] rounded-full border border-red-500/20 transform -translate-x-1/2 -translate-y-1/2">
             <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full border border-red-500/20 transform -translate-x-1/2 -translate-y-1/2" />
             <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full border border-red-500/30 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <motion.div
            className="absolute top-1/2 left-1/2 w-[400px] h-[3px] bg-gradient-to-r from-transparent via-red-500/60 to-red-600 origin-left drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
