import { useDesignStore } from "../stores/designStore";
import type { PanelOrientation } from "../types";

const THICKNESS_OPTIONS = [12, 15, 18, 19, 25];
const SHEET_PRESETS = [
  { label: "2440 × 1220 mm (8' × 4')", width: 2440, height: 1220 },
  { label: "2440 × 610 mm (8' × 2')", width: 2440, height: 610 },
  { label: "1220 × 610 mm (4' × 2')", width: 1220, height: 610 },
];

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

export default function Sidebar() {
  const {
    panels,
    selectedPanelId,
    settings,
    updatePanel,
    deletePanel,
    updateSettings,
  } = useDesignStore();

  const selectedPanel = panels.find((p) => p.id === selectedPanelId);

  return (
    <div className="w-72 bg-white border-l border-gray-200 p-4 flex flex-col gap-6 overflow-y-auto">
      {/* Panel Properties */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {selectedPanel ? "Panel Properties" : "Select a Panel"}
        </h3>

        {selectedPanel ? (
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

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={selectedPanel.quantity}
                onChange={(e) =>
                  updatePanel(selectedPanel.id, {
                    quantity: Math.max(1, parseInt(e.target.value) || 1),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Orientation
              </label>
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
              <p className="text-xs text-gray-400 mt-1">
                {
                  ORIENTATION_OPTIONS.find(
                    (o) =>
                      o.value === (selectedPanel.orientation || "horizontal"),
                  )?.description
                }
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
          <p className="text-sm text-gray-400">
            Click on a panel to edit its properties, or add a new panel to get
            started.
          </p>
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
