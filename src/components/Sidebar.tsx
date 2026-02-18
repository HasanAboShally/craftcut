import { useState } from "react";
import { useDesignStore } from "../stores/designStore";
import type { EdgeBanding, PanelOrientation, ZAlignment, GrainDirection } from "../types";

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
  } = useDesignStore();

  // If exactly one panel is selected, show its properties
  const selectedPanel =
    selectedPanelIds.length === 1
      ? panels.find((p) => p.id === selectedPanelIds[0])
      : null;

  // Multiple panels selected
  const multipleSelected = selectedPanelIds.length > 1;

  return (
    <div className="w-full h-full bg-white dark:bg-slate-800 p-4 flex flex-col gap-5 overflow-y-auto">
      {/* Panel Properties */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          {selectedPanel
            ? "Panel Properties"
            : multipleSelected
              ? `${selectedPanelIds.length} Panels Selected`
              : "Select a Panel"}
        </h3>

        {multipleSelected ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedPanelIds.length} panels selected. Use arrow keys to move
              them together, or Cmd+D to duplicate.
            </p>
            <button
              onClick={() => deletePanels(selectedPanelIds)}
              className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              Delete {selectedPanelIds.length} Panels
            </button>
          </div>
        ) : selectedPanel ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Label</label>
              <input
                type="text"
                value={selectedPanel.label}
                onChange={(e) =>
                  updatePanel(selectedPanel.id, { label: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <select
                value={selectedPanel.orientation || "horizontal"}
                onChange={(e) =>
                  updatePanel(selectedPanel.id, {
                    orientation: e.target.value as PanelOrientation,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {/* Edge Banding */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">
                Edge Banding
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "top", label: "Top" },
                  { key: "bottom", label: "Bottom" },
                  { key: "left", label: "Left" },
                  { key: "right", label: "Right" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPanel.edgeBanding?.[key as keyof EdgeBanding] || false}
                      onChange={(e) =>
                        updatePanel(selectedPanel.id, {
                          edgeBanding: {
                            ...selectedPanel.edgeBanding,
                            [key]: e.target.checked,
                          } as EdgeBanding,
                        })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Select edges that need banding
              </p>
            </div>

            {/* Grain Direction */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">
                Grain Direction
              </label>
              <div className="flex gap-2">
                {[
                  { value: "none", label: "None", icon: "○" },
                  { value: "horizontal", label: "Horizontal", icon: "↔" },
                  { value: "vertical", label: "Vertical", icon: "↕" },
                ].map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => updatePanel(selectedPanel.id, { grainDirection: value as GrainDirection })}
                    className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                      (selectedPanel.grainDirection || "none") === value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="block text-base">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Constrains rotation during cutting optimization
              </p>
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
      <hr className="border-gray-200 dark:border-slate-700" />

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
