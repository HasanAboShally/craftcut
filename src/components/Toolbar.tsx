import { Download, Plus, Printer, Trash2, Upload } from "lucide-react";
import React, { useRef } from "react";
import { exportToCSV, exportToJSON, importFromJSON } from "../lib/export";
import { calculateCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";

export default function Toolbar() {
  const { addPanel, clearAll, panels, exportDesign, loadDesign } =
    useDesignStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const data = exportDesign();
    exportToJSON(data);
  };

  const handleExportCSV = () => {
    const { pieces } = calculateCutList(panels);
    exportToCSV(pieces);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await importFromJSON(file);
      loadDesign(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearAll = () => {
    if (panels.length === 0) return;
    if (
      confirm(
        "Are you sure you want to clear all panels? This cannot be undone.",
      )
    ) {
      clearAll();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 mr-4">
          <span className="text-xl">🪵</span>
          <h1 className="text-lg font-bold text-gray-800">CraftCut</h1>
        </div>

        <button
          onClick={addPanel}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Add Panel
        </button>

        <button
          onClick={handleClearAll}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
        >
          <Trash2 size={16} />
          Clear All
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
        >
          <Upload size={16} />
          Import
        </button>

        <div className="relative group">
          <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm">
            <Download size={16} />
            Export
          </button>

          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
            <button
              onClick={handleExportJSON}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg"
            >
              Save as JSON
            </button>
            <button
              onClick={handleExportCSV}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Export Cut List (CSV)
            </button>
            <button
              onClick={handlePrint}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 last:rounded-b-lg flex items-center gap-2"
            >
              <Printer size={14} />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
