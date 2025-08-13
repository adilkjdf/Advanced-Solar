export interface Module {
  id?: string;
  manufacturer: string;
  model: string;
  pnom: number | null;   // W
  vmp: number | null;    // V
  imp: number | null;    // A
  voc: number | null;    // V
  isc: number | null;    // A
  ns?: number | null;    // series cells
  np?: number | null;    // parallel strings
  area?: number | null;  // m^2
  created_at?: string;
}
