import { useState } from "react";
import { useDesignStore } from "../stores/designStore";
import type { PanelOrientation, ZAlignment } from "../types";

const THICKNESS_OPTIONS = [12, 15, 18, 19, 25];
const SHEET_PRESETS = [
  { label: "2440 × 1220 mm (8' × 4')", width: 2440, height: 1220 },
  { label: "2440 × 610 mm (8' × 2')", width: 2440, height: 610 },
  { label: "1220 × 610 mm (4' × 2')", width: 1220, height: 610 },
];

// Validation constraints
const MIN_DIMENSION = 10;
const MAX_DIMENSION = 10000;
const MIN_POSITION = -5000;
const MAX_POSITION = 10000;

// Validated number input handler
function useValidatedInput(
  initialValue: number,
  min: number,
  max: number,
  onChange: (value: number) => void
) {
  const [error, setError] = useState<string | null>(null);
  const [localValue, setLocalValue] = useState(String(initialValue));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    
    const num = parseInt(raw);
    if (isNaN(num)) {
      setError("Enter a number");
      return;
    }
    if (num < min) {
      setError(`Min: ${min}`);
      return;
    }
    if (num > max) {
      setError(`Max: ${max}`);
      return;
    }
    
    setError(null);
    onChange(num);
  };

  const handleBlur = () => {
    // Reset to valid value on blur if error
    if (error) {
      const num = parseInt(localValue);
      const clampedValue = isNaN(num) ? min : Math.max(min, Math.min(max, num));
      setLocalValue(String(clampedValue));
      setError(null);
      onChange(clampedValue);
    }
  };

  return { value: localValue, error, handleChange, handleBlur, setLocalValue };
}

const ORIENTATION_OPTIONS: {
  value: PanelOrientation;
  label: string;
  description: string;
}[] = [
  {
    value: "horizontal",
    label: "Horizontal (Shelf)",
    description: "Lies flat - shelves, top, bottom",
  },
  {
    value: "vertical",
    label: "Vertical (Side)",
    description: "Stands upright - sides, dividers",
  },
  {
    value: "back",
    label: "Back Panel",
    description: "Faces forward - back of furniture",
  },
];

const Z_ALIGN_OPTIONS: {
  value: ZAlignment;
  label: string;
}[] = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "center", label: "Center" },
];

export default function Sidebar() {
  const {
    panels,
    selectedPanelIds,
    settings,
    updatePanel,
    deletePanel,
    deletePanels,
    updateSettings,
  } = useDesignStore();

  // If exactly one panel is selected, show its properties
  const selectedPanel =
    selectedPanelIds.length === 1
      ? panels.find((p) => p.id === selectedPanelIds[0])
      : null;

  // Multiple panels selected
  const multipleSelected = selectedPanelIds.length > 1;

  return (
    <div className="w-full h-full bg-white p-4 flex flex-col gap-5 overflow-y-auto">
      {/* Panel Properties */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {selectedPanel
            ? "Panel Properties"
            : multipleSelected
              ? `${selectedPanelIds.length} Panels Selected`
              : "Select a Panel"}
        </h3>

        {multipleSelected ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {selectedPanelIds.length} panels selected. Use arrow keys to move
              them together, or Cmd+D to duplicate.
            </p>
            <button
              onClick={() => deletePanels(selectedPanelIds)}
              className="w-full px-3 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Delete {selectedPanelIds.length} Panels
            </button>
          </div>
        ) : selectedPanel ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label</label>
              <input
                type="text"
                value={selectedPanel.label}
                onChange={(e) =>
                  updatePanel(selectedPanel.id, { label: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={selectedPanel.orientation || "horizontal"}
                onChange={(e) =>
                  updatePanel(selectedPanel.id, {
                    orientation: e.target.value as PanelOrientation,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ORIENTATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dimensions - context-sensitive based on orientation */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Dimensions
              </h4>

              {(selectedPanel.orientation || "horizontal") === "horizontal" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      value={selectedPanel.width}
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          width: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Depth (mm)
                    </label>
                    <input
                      key={`depth-h-${selectedPanel.id}`}
                      type="number"
                      min={10}
                      value={
                        selectedPanel.depth ?? settings.furnitureDepth ?? 400
                      }
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          depth:
                            parseInt(e.target.value) ||
                            settings.furnitureDepth ||
                            400,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {(selectedPanel.orientation || "horizontal") === "vertical" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      value={selectedPanel.height}
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          height: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Depth (mm)
                    </label>
                    <input
                      key={`depth-v-${selectedPanel.id}`}
                      type="number"
                      min={10}
                      value={
                        selectedPanel.depth ?? settings.furnitureDepth ?? 400
                      }
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          depth:
                            parseInt(e.target.value) ||
                            settings.furnitureDepth ||
                            400,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {selectedPanel.orientation === "back" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      value={selectedPanel.width}
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          width: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      value={selectedPanel.height}
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          height: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-2">
                Thickness: {settings.thickness}mm (from material settings)
              </p>
            </div>

            {/* Z-alignment - only for horizontal/vertical with custom depth */}
            {(selectedPanel.orientation || "horizontal") !== "back" &&
              selectedPanel.depth &&
              selectedPanel.depth < settings.furnitureDepth && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Depth Position
                  </label>
                  <div className="flex gap-1">
                    {Z_ALIGN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          updatePanel(selectedPanel.id, { zAlign: opt.value })
                        }
                        className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                          (selectedPanel.zAlign || "front") === opt.value
                            ? "bg-blue-100 border-blue-300 text-blue-700"
                            : "border-gray-300 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Position inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  X Position (mm)
                </label>
                <input
                  type="number"
                  value={Math.round(selectedPanel.x)}
                  onChange={(e) =>
                    updatePanel(selectedPanel.id, {
                      x: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Y Position (mm)
                </label>
                <input
                  type="number"
                  value={Math.round(selectedPanel.y)}
                  onChange={(e) =>
                    updatePanel(selectedPanel.id, {
                      y: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <button
              onClick={() => deletePanel(selectedPanel.id)}
              className="w-full px-3 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Delete Panel
            </button>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No panel selected</p>
            <p className="text-xs text-gray-400 max-w-[200px] mx-auto">
              Click on a panel in the canvas to edit its properties, or add a new panel using the button above.
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className="border-gray-200" />

      {/* Material Settings */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Material Settings
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Thickness (mm)
            </label>
            <select
              value={settings.thickness}
              onChange={(e) =>
                updateSettings({ thickness: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {THICKNESS_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t} mm
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={settings.projectName || ""}
              onChange={(e) => updateSettings({ projectName: e.target.value })}
              placeholder="My Bookshelf"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Appears on print cover page
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Furniture Depth (mm)
            </label>
            <input
              type="number"
              min={100}
              max={1000}
              step={10}
              value={settings.furnitureDepth || 400}
              onChange={(e) =>
                updateSettings({
                  furnitureDepth: parseInt(e.target.value) || 400,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Default depth for all panels
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Sheet Size
            </label>
            <select
              value={`${settings.sheetWidth}x${settings.sheetHeight}`}
              onChange={(e) => {
                const preset = SHEET_PRESETS.find(
                  (p) => `${p.width}x${p.height}` === e.target.value,
                );
                if (preset) {
                  updateSettings({
                    sheetWidth: preset.width,
                    sheetHeight: preset.height,
                  });
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SHEET_PRESETS.map((p) => (
                <option
                  key={`${p.width}x${p.height}`}
                  value={`${p.width}x${p.height}`}
                >
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Wood Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.woodColor || "#E8D4B8"}
                onChange={(e) => updateSettings({ woodColor: e.target.value })}
                className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <select
                value={settings.woodColor || "#E8D4B8"}
                onChange={(e) => updateSettings({ woodColor: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="#E8D4B8">Light Plywood</option>
                <option value="#D4A574">Pine</option>
                <option value="#C19A6B">Oak</option>
                <option value="#8B7355">Walnut</option>
                <option value="#F5F5DC">Birch</option>
                <option value="#DEB887">Beech</option>
                <option value="#A0522D">Mahogany</option>
                <option value="#FFFFFF">White Melamine</option>
                <option value="#2C2C2C">Black Melamine</option>
              </select>
            </div>
          </div>

          {/* Cost Settings */}
          <div className="pt-3 border-t border-gray-200 mt-3">
            <label className="block text-xs text-gray-500 mb-1">
              Sheet Price (for cost estimates)
            </label>
            <div className="flex gap-2">
              <select
                value={settings.currency || "$"}
                onChange={(e) => updateSettings({ currency: e.target.value })}
                className="w-16 px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="$">$</option>
                <option value="€">€</option>
                <option value="£">£</option>
                <option value="¥">¥</option>
                <option value="₹">₹</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={settings.sheetPrice || ""}
                onChange={(e) => updateSettings({ sheetPrice: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Set price per sheet to see cost estimates
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          <div className="flex justify-between">
            <span>Total panels:</span>
            <span className="font-medium text-gray-700">{panels.length}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Total pieces:</span>
            <span className="font-medium text-gray-700">
              {panels.reduce((sum, p) => sum + p.quantity, 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
