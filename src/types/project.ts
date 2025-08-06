export interface Design {
  id: string;
  name: string;
  clonedFrom?: string;
  project_id: string;
  created_at: string;
}

export interface FieldSegment {
  id: string;
  geometry: any; // Stores the maptalks geometry JSON
  area: number;
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