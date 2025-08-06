export interface ProjectData {
  projectName: string;
  description: string;
  address: string;
  projectType: 'Residential' | 'Commercial' | 'Industrial';
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface ValidationErrors {
  [key: string]: string;
}

export interface MapSettings {
  center: [number, number];
  zoom: number;
}