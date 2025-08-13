import React, { useEffect, useRef, useState } from 'react';
import { Module } from '../types/library';
import { supabase } from '../integrations/supabase/client';

// Basic PAN parser (PVsyst-like): looks for key=value pairs in lines
type ParsedPAN = Partial<Module> & {
  technology?: string | null;
  length_m?: number | null;
  width_m?: number | null;
  temp_coeff_pmax?: number | null; // per °C (e.g., -0.0045)
  temp_coeff_voc?: number | null;  // per °C
  temp_coeff_isc?: number | null;  // per °C
  source?: string | null;
  last_update?: string | null;
  raw?: Record<string, string>;
};

// Improved PAN parser: supports more PVsyst-like keys and flexible units
function parsePAN(text: string): ParsedPAN {
  const lines = text.split(/\r?\n/);
  const kv: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('*') || line.startsWith('//')) continue;
    const m = line.match(/^([A-Za-z0-9_\-\.]+)\s*=\s*(.+)$/);
    if (m) kv[m[1].toLowerCase()] = m[2];
  }
  const num = (s?: string) => (s != null ? Number(String(s).replace(/[^0-9eE+\-.]/g, '')) : null);
  // Generic percent-or-fraction reader (best effort). For known PVsyst percent fields we'll override below.
  const pctOrFrac = (s?: string) => {
    if (s == null) return null;
    const n = num(s);
    if (n == null || Number.isNaN(n)) return null;
    // Heuristic: values with abs > 1 are likely %; tiny values are already fraction
    return Math.abs(n) > 1 ? n / 100 : n;
  };

  const manufacturer = kv['manufacturer'] || kv['manuf'] || kv['maker'] || '';
  const model = kv['model'] || kv['module'] || kv['name'] || '';

  // Common fields (include PVsyst aliases)
  const pnom = num(kv['pn'] || kv['pnom'] || kv['pmpp'] || kv['pmax']);
  const vmp = num(kv['vmpp'] || kv['vmp']);
  const imp = num(kv['impp'] || kv['imp']);
  const voc = num(kv['voc']);
  const isc = num(kv['isc']);
  const ns = num(kv['ns'] || kv['ncels'] || kv['ncels']);
  const np = num(kv['np'] || kv['ncelp']);

  // Technology mapping: PVsyst "Technol" codes
  const techRaw = (kv['technology'] || kv['tech'] || kv['techno'] || kv['technol'] || '').toLowerCase();
  const TECH_MAP: Record<string,string> = {
    'mtsimono': 'Monocrystalline Silicon',
    'mtsipoly': 'Polycrystalline Silicon',
    'mtsiamorph': 'Amorphous Silicon',
    'mtcis': 'CIS/CIGS',
    'mtcigs': 'CIS/CIGS',
    'mtcdte': 'Cadmium Telluride (CdTe)',
    'mthjt': 'HJT/Hetrojunction',
    'mthit': 'HIT/Hetrojunction',
    'mtpht': 'Thin-film',
  };
  const technology = TECH_MAP[techRaw] || (techRaw ? techRaw : null);

  // Dimensions (PVsyst: Width/Height are already meters)
  let length_m: number | null = null;
  let width_m: number | null = null;
  const length = num(kv['length'] || kv['len'] || kv['lmodule'] || kv['height'] || kv['length_m']);
  const width = num(kv['width'] || kv['wmodule'] || kv['width_m']);
  if (length != null) length_m = length > 10 ? length / 1000 : length;
  if (width != null) width_m = width > 10 ? width / 1000 : width;
  // Prefer computed module area from dimensions when available
  const area = (length_m && width_m) ? Number((length_m * width_m).toFixed(4)) : num(kv['area']);

  // Temperature coefficients
  // 1) Pmax: PVsyst often uses muPmpReq ~ -0.3..-0.5 (%/°C)
  let temp_coeff_pmax: number | null = null;
  if (kv['mupmpreq'] != null) {
    const v = num(kv['mupmpreq']);
    if (v != null) temp_coeff_pmax = v / 100; // %/°C -> fraction/°C
  } else {
    temp_coeff_pmax = pctOrFrac(kv['mu_pmax'] || kv['mupmax'] || kv['dpmax/dt'] || kv['tempco_pmax']);
  }
  // 2) Voc: muVocSpec usually in mV/°C at module level
  let temp_coeff_voc: number | null = null;
  if (kv['muvocspec'] != null && voc != null) {
    const mvPerC = num(kv['muvocspec']); // mV/°C
    if (mvPerC != null) temp_coeff_voc = (mvPerC / 1000) / voc; // fraction/°C
  } else {
    temp_coeff_voc = pctOrFrac(kv['mu_voc'] || kv['muvoc'] || kv['dvoc/dt'] || kv['tempco_voc']);
  }
  // 3) Isc: muISC usually in mA/°C at module level
  let temp_coeff_isc: number | null = null;
  if (kv['muisc'] != null && isc != null) {
    const mAperC = num(kv['muisc']);
    if (mAperC != null) temp_coeff_isc = (mAperC / 1000) / isc; // fraction/°C
  } else {
    temp_coeff_isc = pctOrFrac(kv['mu_isc'] || kv['disc/dt'] || kv['alpha'] || kv['tempco_isc']);
  }

  const source = kv['source'] || kv['lab'] || kv['origin'] || kv['datasource'] || null;
  const last_update = kv['lastupdate'] || kv['updated'] || kv['pricedate'] || null;
  return { manufacturer, model, pnom, vmp, imp, voc, isc, ns, np, area, technology, length_m, width_m, temp_coeff_pmax, temp_coeff_voc, temp_coeff_isc, source, last_update, raw: kv };
}

// Helpers to render a curated set of RAW parameters matching the screenshot
type RawRow = [label: string, value: string];
// Estimate I0ref and Iphref using single-diode equations at STC when not present in the file.
function computeRefCurrents(parsed: ParsedPAN): { i0ref?: number; iphref?: number } {
  const raw = parsed.raw || {};
  const num = (s?: string | null) => (s != null ? Number(String(s).replace(/[^0-9eE+\-.]/g, '')) : NaN);
  const pickNum = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k.toLowerCase()];
      if (v != null && String(v).trim() !== '') {
        const n = num(v);
        if (!Number.isNaN(n)) return n;
      }
    }
    return NaN;
  };
  const Voc = typeof parsed.voc === 'number' ? parsed.voc : num(raw['voc']);
  const Isc = typeof parsed.isc === 'number' ? parsed.isc : num(raw['isc']);
  const Rs = pickNum('rserie','rs','series_resistance');
  const Rsh = pickNum('rshunt','rshref','rshuntref');
  const Ns = typeof parsed.ns === 'number' ? parsed.ns : pickNum('ncels','ns');
  const gamma = pickNum('gamma','gamma_ref','yref');
  const tC = pickNum('tref') || 25;

  if ([Voc, Isc, Rs, Rsh, Ns, gamma].some((x) => Number.isNaN(x) || !isFinite(x) || x <= 0)) {
    return {};
  }
  const k_over_q = 8.617333262145e-5; // V/K
  const T = 273.15 + tC;
  const Vt = k_over_q * T; // thermal voltage [V]
  const denom = gamma * Ns * Vt; // diode denominator
  if (!isFinite(denom) || denom <= 0) return {};

  const E_voc = Math.exp(Voc / denom);
  const E_isc = Math.exp((Isc * Rs) / denom);
  // Avoid overflow/degenerate cases
  if (!isFinite(E_voc) || !isFinite(E_isc) || Math.abs(E_voc - E_isc) < 1e-12) return {};

  const I0 = (Isc + (Isc * Rs) / Rsh - Voc / Rsh) / (E_voc - E_isc);
  if (!isFinite(I0) || I0 <= 0) return {};
  const Iph = I0 * (E_voc - 1) + Voc / Rsh;
  if (!isFinite(Iph) || Iph <= 0) return { i0ref: I0 };
  return { i0ref: I0, iphref: Iph };
}
function getCuratedRawRows(parsed: ParsedPAN): RawRow[] {
  const raw = parsed.raw || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k.toLowerCase()];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return undefined;
  };
  const num = (s?: string) => (s != null ? Number(String(s).replace(/[^0-9eE+\-.]/g, '')) : NaN);
  const fmtA = (val?: number | string) => {
    if (val == null || val === '') return '-';
    const n = typeof val === 'number' ? val : num(String(val));
    if (Number.isNaN(n)) return String(val);
    if (Math.abs(n) < 1e-3) return `${n.toExponential(6)} A`;
    return `${n.toPrecision(6)} A`;
  };
  const fmtOhm = (s?: string) => {
    if (s == null || s === '') return '-';
    const n = num(s);
    return Number.isNaN(n) ? s : `${n} Ω`;
  };

  const rows: RawRow[] = [];
  rows.push(['Module Characterization Type', 'PAN']);
  rows.push(['Methodology', 'PAN File Coefficients']);

  // Reference Saturation Current, I0ref
  let i0ref = pick('i0ref','i0_ref','ioref','i0');
  let iphref = pick('iphref','iph_ref','iph');
  if (!i0ref || !iphref) {
    const est = computeRefCurrents(parsed);
    if (!i0ref && est.i0ref != null) i0ref = String(est.i0ref);
    if (!iphref && est.iphref != null) iphref = String(est.iphref);
  }
  rows.push(['Reference Saturation Current, I0ref', fmtA(i0ref)]);

  // Reference Photocurrent, Iphref
  rows.push(['Reference Photocurrent, Iphref', fmtA(iphref)]);

  // Module Quality Factor, γref
  const gammaRef = pick('gamma_ref','gammaref','yref','gamma');
  rows.push(['Module Quality Factor, γref', gammaRef ?? '-']);

  // Module Quality Factor Temp Dependence, μγ
  const muGamma = pick('mu_gamma','mugamma','mu_gamma_ref','mu_y');
  rows.push(['Module Quality Factor Temp Dependence, μγ', muGamma ?? '-']);

  // Current Temperature Coefficient, μIsc (fallback to parsed temp coeff if raw missing)
  let muIsc = pick('mu_isc','muisc','alpha','tempco_isc');
  if (muIsc) {
    const n = num(muIsc);
    if (!Number.isNaN(n)) muIsc = `${n.toString()} mA/°C`;
  } else if (typeof parsed.temp_coeff_isc === 'number' && parsed.isc) {
    // Convert fractional coeff to mA/°C when possible
    const mA = parsed.temp_coeff_isc * parsed.isc * 1000;
    muIsc = `${mA.toFixed(3)} mA/°C`;
  }
  rows.push(['Current Temperature Coefficient, μIsc', muIsc ?? '-']);

  // Series Resistance, Rs
  const rs = pick('rs','rseries','series_resistance','rserie');
  rows.push(['Series Resistance, Rs', fmtOhm(rs)]);

  // Default Shunt Resistance, Rshunt(0)
  const rsh0 = pick('rshunt0','rsh0','rshunt_0','rp_0');
  rows.push(['Default Shunt Resistance, Rshunt(0)', fmtOhm(rsh0)]);

  // Reference Shunt Resistance, Rshunt(Gref)
  const rshRef = pick('rshuntref','rshref','rshunt_gref','rshunt');
  rows.push(['Reference Shunt Resistance, Rshunt(Gref)', fmtOhm(rshRef)]);

  // Exponential Shunt Resistance Factor, β
  const rshExp = pick('rshuntexp','rsh_exp','rshexp','beta_rsh','beta','rp_exp');
  rows.push(['Exponential Shunt Resistance Factor, β', rshExp ?? '-']);

  return rows;
}

type PreviewPerformanceProps = { parsed: ParsedPAN };
const PreviewPerformance: React.FC<PreviewPerformanceProps> = ({ parsed }) => {
  const tempC = 25;
  // Baselines with reasonable fallbacks
  const pnom = parsed.pnom ?? 300;
  const vmp = parsed.vmp ?? 30;
  const imp = parsed.imp ?? (pnom / vmp);
  const voc = parsed.voc ?? (vmp * 1.25);
  const isc = parsed.isc ?? (imp * 1.05);
  const gamma = parsed.temp_coeff_pmax ?? -0.004; // Pmax per °C (fraction)
  const beta = parsed.temp_coeff_voc ?? -0.0023; // Voc per °C (fraction)
  const alpha = parsed.temp_coeff_isc ?? 0.0005; // Isc per °C (fraction)

  const rows = [1000, 800, 600, 400, 200, 100].map((G) => {
    const gf = G / 1000;
    const dT = tempC - 25;
    const IscT = isc * gf * (1 + alpha * dT);
    // Approximate Voc scales weakly with irradiance and temp
    const VocG = voc * (0.95 + 0.05 * gf) * (1 + beta * dT);
    const Pbase = pnom * gf;
    const PmpT = Pbase * (1 + gamma * dT);
    const VmpT = vmp * (0.95 + 0.05 * gf) * (1 + beta * dT);
    const ImpT = PmpT / Math.max(VmpT, 0.1);
    return { G, IscT, VocG, VmpT, ImpT, PmpT };
  });

  return (
  <div className="p-3 space-y-3 rounded-b-lg">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>Source: {parsed.source || 'PAN file'}</div>
        <div>Temperature: <span className="font-medium">{tempC}°C</span></div>
      </div>
      <div>
          {/* Modeled performance table */}
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left">Irradiance (W/m²)</th>
                  <th className="px-2 py-2 text-right">Isc (A)</th>
                  <th className="px-2 py-2 text-right">Voc (V)</th>
                  <th className="px-2 py-2 text-right">Vmp (V)</th>
                  <th className="px-2 py-2 text-right">Imp (A)</th>
                  <th className="px-2 py-2 text-right">Power (W)</th>
                  <th className="px-2 py-2 text-right">dPmp/dT</th>
                  <th className="px-2 py-2 text-right">dVmp/dT</th>
                  <th className="px-2 py-2 text-right">dIsc/dT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.G} className="border-t">
                    <td className="px-2 py-2">{r.G}</td>
                    <td className="px-2 py-2 text-right">{r.IscT.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{r.VocG.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{r.VmpT.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{r.ImpT.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{r.PmpT.toFixed(0)}</td>
                    <td className="px-2 py-2 text-right">{(gamma*100).toFixed(2)}%/°C</td>
                    <td className="px-2 py-2 text-right">{(beta*100).toFixed(2)}%/°C</td>
                    <td className="px-2 py-2 text-right">{(alpha*100).toFixed(2)}%/°C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  );
};

const ModulesPage: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Modal multiple files state (for batch upload inside popup)
  const [modalFiles, setModalFiles] = useState<Array<{ file: File; parsed?: ParsedPAN }>>([]);
  const [modalPreview, setModalPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<null | { file?: File; parsed: ParsedPAN; text?: string }>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const loadModules = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.from('modules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setModules((data || []) as Module[]);
    } catch (e: any) {
      setError('Could not load modules from Supabase.');
      console.error('Loading modules failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadModules(); }, []);

  const onUploadOne = async (file: File) => {
    setLoading(true); setError(null);
    let newModuleId: string | null = null;
    try {
      const text = await file.text();
      const parsed = parsePAN(text);
      if (!parsed.manufacturer || !parsed.model) {
        throw new Error('Manufacturer and Model are required fields not found in the PAN file.');
      }
      
      const exists = modules.some(m => 
        m.manufacturer.trim().toLowerCase() === (parsed.manufacturer||'').trim().toLowerCase() && 
        m.model.trim().toLowerCase() === (parsed.model||'').trim().toLowerCase()
      );
      if (exists) {
        setError('This module already exists in the library.');
        setLoading(false);
        return;
      }

      const mod = {
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        pnom: parsed.pnom ?? null,
        vmp: parsed.vmp ?? null,
        imp: parsed.imp ?? null,
        voc: parsed.voc ?? null,
        isc: parsed.isc ?? null,
        ns: parsed.ns ?? null,
        np: parsed.np ?? null,
        area: parsed.area ?? null,
      };

      const { data: newModule, error: moduleError } = await supabase.from('modules').insert(mod).select().single();
      if (moduleError) throw moduleError;

      newModuleId = (newModule as any).id;

      const { error: detailsError } = await supabase.from('module_details').insert({ 
        module_id: newModuleId, 
        parsed: parsed, 
        pan_text: text 
      });
      
      if (detailsError) {
        throw new Error(`Failed to save module details: ${detailsError.message}`);
      }

      setModules(prev => [newModule as Module, ...prev]);

    } catch (e: any) {
      // If details failed to save, roll back the module creation for consistency
      if (newModuleId) {
        await supabase.from('modules').delete().eq('id', newModuleId);
      }
      setError(e?.message || 'Failed to parse or save PAN file');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onChooseModalFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    const pending = arr.map(async (f) => {
      try { const txt = await f.text(); return { file: f, parsed: parsePAN(txt) }; } catch { return { file: f }; }
    });
    const resolved = await Promise.all(pending);
    setModalFiles(prev => [...prev, ...resolved]);
    setModalPreview(null);
  };

  const onPreviewSaved = async (m: Module) => {
    if (!m.id) return;
    setPreviewData(null);
    setPreviewOpen(true);
    try {
      const { data, error } = await supabase.from('module_details').select('parsed, pan_text').eq('module_id', m.id).maybeSingle();
      if (error) throw error;
      
      if (data && data.parsed) {
        const extras = { parsed: data.parsed as ParsedPAN, text: (data.pan_text as string) || undefined };
        setPreviewData({ parsed: { ...extras.parsed, manufacturer: m.manufacturer, model: m.model }, text: extras.text });
      } else {
        setPreviewData({ parsed: { manufacturer: m.manufacturer, model: m.model, pnom: m.pnom ?? undefined, vmp: m.vmp ?? undefined, imp: m.imp ?? undefined, voc: m.voc ?? undefined, isc: m.isc ?? undefined, ns: m.ns ?? undefined, np: m.np ?? undefined, area: m.area ?? undefined, source: 'Saved module' } });
      }
    } catch (e: any) {
      setError('Could not load module details.');
      console.error(e);
      setPreviewData({ parsed: { manufacturer: m.manufacturer, model: m.model, pnom: m.pnom ?? undefined, vmp: m.vmp ?? undefined, imp: m.imp ?? undefined, voc: m.voc ?? undefined, isc: m.isc ?? undefined, ns: m.ns ?? undefined, np: m.np ?? undefined, area: m.area ?? undefined, source: 'Saved module (details failed to load)' } });
    }
  };

  const onDeleteModule = async (m: Module) => {
    if (!m.id) return;
    const originalModules = modules;
    setModules(prev => prev.filter(x => x.id !== m.id));
    try {
      const { error } = await supabase.from('modules').delete().eq('id', m.id);
      if (error) throw error;
    } catch (e: any) {
      setError('Failed to delete module.');
      setModules(originalModules);
      console.error(e);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Modules Library</h2>
      </div>
    <div className="mb-4">
        <button
          className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600"
      onClick={() => { setIsModalOpen(true); setModalFiles([]); setModalPreview(null); }}
        >
          Upload Module
        </button>
      </div>
      {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}

      {/* Modal popup for Upload/Preview */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-7xl mx-4 rounded-lg shadow-xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Upload Module</h3>
              <button className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <div className="p-4">
              {/* Top action row like screenshot */}
              <div className="mb-4 flex items-center flex-wrap gap-2">
                <label className="px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 cursor-pointer">
                  Select Files
                  <input
                    ref={modalFileInputRef}
                    multiple
                    type="file"
                    accept=".pan,.PAN,.txt"
                    className="hidden"
                    onChange={(e) => onChooseModalFiles(e.target.files)}
                  />
                </label>
                <button
                  className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600"
                  onClick={async () => {
                    if (modalFiles.length === 0) { setError('No files selected'); return; }
                    for (const f of modalFiles) {
                      await onUploadOne(f.file);
                    }
                    setIsModalOpen(false);
                    setModalFiles([]);
                    setModalPreview(null);
                  }}
                >
                  Save All Files
                </button>
                <button
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
                  onClick={() => setModalFiles([])}
                >
                  Clear
                </button>
                <span className="ml-auto text-sm text-gray-500">{modalFiles.length} file(s) selected</span>
              </div>

              {/* Table header */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700 border-b">
                  <div className="col-span-4">File</div>
                  <div className="col-span-3">Details</div>
                  <div className="col-span-3">Module</div>
                  <div className="col-span-2">Actions</div>
                </div>
                <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                  {modalFiles.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">No files selected. Use "Select Files" above.</div>
                  ) : modalFiles.map((f, idx) => {
                    const parsed = f.parsed || {};
                    const mf = parsed.manufacturer || '-';
                    const model = parsed.model || '-';
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-4 px-4 py-3 border-b items-center text-sm hover:bg-gray-50">
                        <div className="col-span-4">
                          <div className="font-medium text-gray-800 whitespace-normal break-words">{f.file.name}</div>
                          <div className="text-gray-500 text-xs">{(f.file.size/1024).toFixed(2)}KB</div>
                        </div>
                        <div className="col-span-3">
                          <div><span className="font-semibold">Manufacturer:</span> {mf}</div>
                          <div><span className="font-semibold">Model:</span> {model}</div>
                          <div className="text-xs text-gray-500"><span className="font-semibold">Source:</span> PAN file</div>
                        </div>
                        <div className="col-span-3 whitespace-normal break-words">
                          We'll add {mf !== '-' ? mf : 'Unknown'}, {model !== '-' ? model : 'Unknown'} to your database when saved.
                        </div>
                        <div className="col-span-2 flex items-center space-x-2 whitespace-nowrap">
                          <button
                            className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm"
                            onClick={async () => {
                              await onUploadOne(f.file);
                              // Optionally remove the row after successful upload
                              setModalFiles(prev => prev.filter((_, i) => i !== idx));
                            }}
                          >Upload</button>
                          <button
                            className="px-3 py-1 bg-sky-500 text-white rounded hover:bg-sky-600 text-sm"
                            onClick={async () => {
                              const txt = await f.file.text();
                              setPreviewData({ file: f.file, parsed: f.parsed || parsePAN(txt), text: txt });
                              setPreviewOpen(true);
                            }}
                          >Preview</button>
                          <button
                            title="Remove file"
                            aria-label="Remove file"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-red-500 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                            onClick={() => setModalFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 0V5a1 1 0 011-1h2a1 1 0 011 1v2m-7 0h10" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {modalPreview && (
                <div className="mt-4 max-h-72 overflow-auto border rounded p-2 bg-gray-50 text-xs whitespace-pre-wrap">
                  {modalPreview}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-end">
              <button className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm" onClick={() => setIsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && previewData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreviewOpen(false)} />
          <div className="relative bg-white w-full max-w-7xl mx-4 rounded-lg shadow-xl">
            <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-100">
              <div className="font-semibold text-gray-800">PAN Characterization Upload</div>
              <button className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded" onClick={() => setPreviewOpen(false)}>×</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Condensed header: name, description, actions in one row */}
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600">Name</label>
                    <input className="w-full border rounded px-2 py-1 text-sm" defaultValue={previewData.file?.name || `${previewData.parsed.manufacturer ?? ''} ${previewData.parsed.model ?? ''}`.trim() || 'Saved Module'} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Description</label>
                    <input className="w-full border rounded px-2 py-1 text-sm" defaultValue={previewData.parsed.source || ''} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="px-3 py-1 border rounded text-sm">Undo</button>
                  {previewData.file && (
                    <button className="px-3 py-1 bg-amber-500 text-white rounded text-sm" onClick={async () => { if (previewData.file) { await onUploadOne(previewData.file); } setPreviewOpen(false); }}>Upload Characterization</button>
                  )}
                </div>
              </div>

              {/* Details */}
              <div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-gray-50 font-medium">Module</div>
                  <div className="text-sm">
                    {[
                      ['Name', previewData.parsed.model || '-'],
                      ['Manufacturer', previewData.parsed.manufacturer || '-'],
                      ['Power', previewData.parsed.pnom != null ? `${previewData.parsed.pnom} W` : '-'],
                      ['Vmp', previewData.parsed.vmp != null ? `${previewData.parsed.vmp} V` : '-'],
                      ['Voc', previewData.parsed.voc != null ? `${previewData.parsed.voc} V` : '-'],
                      ['Isc', previewData.parsed.isc != null ? `${previewData.parsed.isc} A` : '-'],
                      ['Imp', previewData.parsed.imp != null ? `${previewData.parsed.imp} A` : '-'],
                      ['Technology', previewData.parsed.technology || '-'],
                      ['Dimensions', (previewData.parsed.length_m && previewData.parsed.width_m) ? `${previewData.parsed.length_m.toFixed(3)}m x ${previewData.parsed.width_m.toFixed(3)}m` : '-'],
                      ['Temp Coefficient Pmax', previewData.parsed.temp_coeff_pmax != null ? `${(previewData.parsed.temp_coeff_pmax*100).toFixed(2)}%/°C` : '-'],
                      ['Temp Coefficient Voc', previewData.parsed.temp_coeff_voc != null ? `${(previewData.parsed.temp_coeff_voc*100).toFixed(2)}%/°C` : '-'],
                      ['Temp Coefficient Isc', previewData.parsed.temp_coeff_isc != null ? `${(previewData.parsed.temp_coeff_isc*100).toFixed(2)}%/°C` : '-'],
                      ['Source', previewData.parsed.source || '-'],
                      ['Last Update', previewData.parsed.last_update || new Date().toLocaleString()],
                    ].map(([k, v], i) => (
                      <div key={i} className={`grid grid-cols-5 ${i>0 ? 'border-t' : ''}`}>
                        <div className="col-span-2 px-3 py-2 bg-gray-50 text-gray-600">{k}</div>
                        <div className="col-span-3 px-3 py-2">{v as string}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Performance and Raw side-by-side on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Collapsible Performance */}
                <div className="border rounded-lg overflow-hidden flex flex-col min-h-0">
                  <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                    <div className="font-medium">Modeled Performance</div>
                    <button className="text-sm text-sky-600 hover:underline" onClick={() => setShowPerf(v => !v)}>{showPerf ? 'Hide' : 'Show'}</button>
                  </div>
                  {showPerf && (
                    <div className="max-h-[60vh] overflow-auto">
                      <PreviewPerformance parsed={previewData.parsed} />
                    </div>
                  )}
                </div>

                {/* Raw parameters */}
                {previewData.parsed.raw && (
                  <div className="border rounded-lg overflow-hidden flex flex-col min-h-0">
                    <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                      <div className="font-medium">Raw Parameters</div>
                      <button className="text-sm text-sky-600 hover:underline" onClick={() => setShowRaw(v => !v)}>{showRaw ? 'Hide' : 'Show'}</button>
                    </div>
                    {showRaw && (
                      <div className="max-h-[60vh] overflow-auto">
                        <div className="text-sm">
                          {getCuratedRawRows(previewData.parsed).map(([label, value], i) => (
                            <div key={label} className={`grid grid-cols-5 border-t ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                              <div className="col-span-2 px-3 py-2 text-gray-600 break-words">{label}</div>
                              <div className="col-span-3 px-3 py-2 break-words">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved modules table below */}
      <div className="mt-6 bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700 border-b">Saved Modules</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Manufacturer</th>
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-right">Pnom (W)</th>
              <th className="px-4 py-2 text-right">Vmpp (V)</th>
              <th className="px-4 py-2 text-right">Impp (A)</th>
              <th className="px-4 py-2 text-right">Voc (V)</th>
              <th className="px-4 py-2 text-right">Isc (A)</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : modules.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No saved modules yet.</td></tr>
            ) : (
              modules.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{m.manufacturer}</td>
                  <td className="px-4 py-2">{m.model}</td>
                  <td className="px-4 py-2 text-right">{m.pnom ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{m.vmp ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{m.imp ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{m.voc ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{m.isc ?? '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button title="Preview" aria-label="Preview" className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-sky-500 text-sky-600 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400" onClick={() => onPreviewSaved(m)}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z" />
                          <circle cx="12" cy="12" r="2.25"></circle>
                        </svg>
                      </button>
                      <button title="Delete" aria-label="Delete" className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-red-500 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400" onClick={() => onDeleteModule(m)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 0V5a1 1 0 011-1h2a1 1 0 011 1v2m-7 0h10" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ModulesPage;