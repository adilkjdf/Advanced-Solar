export interface Design {
  id: string;
  name: string;
  clonedFrom?: string;
  project_id: string;
  created_at: string;
}

export interface FieldSegment {
  id: string;
  design_id: string;
  geometry: unknown; // Stores the maptalks geometry JSON
  area: number;
  description: string;
  module: string | null;
  racking: 'Fixed Tilt Racking' | 'Flush Mount';
  surfaceHeight: number;
  rackingHeight: number;
  moduleAzimuth: number;
  moduleTilt: number;
  // Sun & Shadows
  spanRise: number; // ratio, e.g., 1.4
  gcr: number; // ground coverage ratio, 0..1
  timeOfDay: string; // HH:mm
  // Time of Day Analysis
  analysisDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  frameSizeUp: number;
  frameSizeWide: number;
  defaultOrientation: 'Landscape' | 'Portrait';
  rowSpacing: number;
  moduleSpacing: number;
  frameSpacing: number;
  setback: number;
  alignment: 'left' | 'right' | 'center' | 'justify';
  // Parapet walls
  parapetHeight?: number; // feet
  created_at: string;
  updated_at: string;
}

export interface ProjectData {
  id: string;
  projectName: string;
  description: string;
  address: string;
  projectType: 'Residential' | 'Commercial' | 'Industrial';
  coordinates?: {
    lat: number;
    lng: number;
  };
  designs?: Design[];
  created_at: string;
}

export interface ValidationErrors {
  [key:string]: string;
}

export interface MapSettings {
  center: [number, number];
  zoom: number;
}