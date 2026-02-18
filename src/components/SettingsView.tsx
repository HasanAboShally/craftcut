import { Palette, Ruler, DollarSign, FileText, Package, Sun, Moon, Monitor } from "lucide-react";
import { useDesignStore } from "../stores/designStore";
import type { MaterialType } from "../types";

const THICKNESS_OPTIONS = [12, 15, 18, 19, 25];

const SHEET_PRESETS = [
  { label: "2440 × 1220 mm (8' × 4')", width: 2440, height: 1220 },
  { label: "2440 × 610 mm (8' × 2')", width: 2440, height: 610 },
  { label: "1220 × 610 mm (4' × 2')", width: 1220, height: 610 },
];

const MATERIALS: { id: MaterialType; name: string; color: string; description: string }[] = [
  { id: "plywood", name: "Plywood", color: "#E8D4B8", description: "Versatile, strong, good for structural parts" },
  { id: "mdf", name: "MDF", color: "#D4C4A8", description: "Smooth surface, great for painting" },
  { id: "particleboard", name: "Particleboard", color: "#C8B89C", description: "Budget-friendly, good for hidden parts" },
  { id: "melamine", name: "Melamine (White)", color: "#FFFFFF", description: "Pre-finished, easy to clean" },
  { id: "solid_wood", name: "Solid Wood", color: "#C19A6B", description: "Premium, natural grain" },
];

const CURRENCIES = [
  { value: "$", label: "USD ($)" },
  { value: "€", label: "EUR (€)" },
  { value: "£", label: "GBP (£)" },
  { value: "¥", label: "JPY (¥)" },
  { value: "₹", label: "INR (₹)" },
];

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{title}</h3>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{children}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1 mb-1.5">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors";

const selectClass = inputClass;

export default function SettingsView() {
  const { settings, updateSettings } = useDesignStore();

  const selectedMaterial = MATERIALS.find((m) => m.id === (settings.materialType || "plywood"));

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Page Header */}
        <div className="mb-2">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Project Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure your project details, material, and cost preferences.
          </p>
        </div>

        {/* Project Info */}
        <SectionCard icon={<FileText size={18} />} title="Project" description="Basic project information">
          <div>
            <FieldLabel hint="Shown on production documents and exports">Project Name</FieldLabel>
            <input
              type="text"
              value={settings.projectName || ""}
              onChange={(e) => updateSettings({ projectName: e.target.value })}
              placeholder="My Bookshelf"
              className={inputClass}
            />
          </div>
        </SectionCard>

        {/* Material Settings */}
        <SectionCard icon={<Package size={18} />} title="Material" description="Board type, thickness, and dimensions">
          <div>
            <FieldLabel>Material Type</FieldLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MATERIALS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    updateSettings({
                      materialType: m.id,
                      woodColor: m.color,
                    });
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
                    (settings.materialType || "plywood") === m.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500"
                      : "border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-gray-300 dark:border-slate-500 shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="font-medium text-xs">{m.name}</span>
                </button>
              ))}
            </div>
            {selectedMaterial && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {selectedMaterial.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Board Thickness</FieldLabel>
              <select
                value={settings.thickness}
                onChange={(e) => updateSettings({ thickness: parseInt(e.target.value) })}
                className={selectClass}
              >
                {THICKNESS_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t} mm
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel hint="Default depth for all panels">Furniture Depth</FieldLabel>
              <div className="relative">
                <input
                  type="number"
                  min={100}
                  max={1000}
                  step={10}
                  value={settings.furnitureDepth || 400}
                  onChange={(e) => updateSettings({ furnitureDepth: parseInt(e.target.value) || 400 })}
                  className={inputClass}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  mm
                </span>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Sheet Size</FieldLabel>
            <select
              value={`${settings.sheetWidth}x${settings.sheetHeight}`}
              onChange={(e) => {
                const preset = SHEET_PRESETS.find((p) => `${p.width}x${p.height}` === e.target.value);
                if (preset) {
                  updateSettings({ sheetWidth: preset.width, sheetHeight: preset.height });
                }
              }}
              className={selectClass}
            >
              {SHEET_PRESETS.map((p) => (
                <option key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        {/* Appearance */}
        <SectionCard icon={<Palette size={18} />} title="Appearance" description="Color and visual preferences">
          <div>
            <FieldLabel>Material Color</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.woodColor || "#E8D4B8"}
                onChange={(e) => updateSettings({ woodColor: e.target.value })}
                className="w-12 h-10 rounded-lg border border-gray-300 dark:border-slate-600 cursor-pointer p-0.5"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                {settings.woodColor || "#E8D4B8"}
              </span>
              <button
                onClick={() => {
                  const mat = MATERIALS.find((m) => m.id === (settings.materialType || "plywood"));
                  if (mat) updateSettings({ woodColor: mat.color });
                }}
                className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Reset to default
              </button>
            </div>
          </div>

          <div>
            <FieldLabel>Theme</FieldLabel>
            <div className="flex gap-2">
              {[
                { value: "light", label: "Light", icon: <Sun size={14} /> },
                { value: "dark", label: "Dark", icon: <Moon size={14} /> },
                { value: "system", label: "System", icon: <Monitor size={14} /> },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateSettings({ theme: opt.value as "light" | "dark" | "system" })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    (settings.theme || "system") === opt.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500"
                      : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-slate-500"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Cost Estimation */}
        <SectionCard
          icon={<DollarSign size={18} />}
          title="Cost Estimation"
          description="Set prices to see material cost estimates in production documents"
        >
          <div>
            <FieldLabel>Currency</FieldLabel>
            <select
              value={settings.currency || "$"}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              className={selectClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel hint="Per full sheet">Sheet Price</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  {settings.currency || "$"}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={settings.sheetPrice || ""}
                  onChange={(e) => updateSettings({ sheetPrice: parseFloat(e.target.value) || 0 })}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </div>

            <div>
              <FieldLabel hint="Per meter of banding">Edge Banding Price</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  {settings.currency || "$"}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={settings.edgeBandingPrice || ""}
                  onChange={(e) => updateSettings({ edgeBandingPrice: parseFloat(e.target.value) || 0 })}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Bottom spacing */}
        <div className="h-4" />
      </div>
    </div>
  );
}
