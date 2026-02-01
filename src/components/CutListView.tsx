import { ClipboardList, Download, FileText, Scissors } from "lucide-react";
import { useDesignStore } from "../stores/designStore";
import CutList from "./CutList";
import CuttingDiagram from "./CuttingDiagram";

export default function CutListView() {
  const { panels, settings, exportDesign } = useDesignStore();

  const handleExportJSON = () => {
    const data = exportDesign();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "craftcut-design.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    // Generate CSV from panels
    const headers = ["Label", "Width (mm)", "Height (mm)", "Quantity"];
    const rows = panels.map((p) =>
      [p.label, p.width, p.height, p.quantity].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cut-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-blue-600" size={24} />
          <div>
            <h2 className="font-semibold text-gray-800">
              Cut List & Optimization
            </h2>
            <p className="text-sm text-gray-500">
              {panels.length} panel{panels.length !== 1 ? "s" : ""} • Sheet
              size: {settings.sheetWidth} × {settings.sheetHeight} mm
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText size={16} />
            Export CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            Export JSON
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Scissors size={16} />
            Print Cut List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {panels.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <ClipboardList size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No panels to cut</p>
              <p className="text-sm">
                Add panels in the Design view to generate a cut list
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Cut List Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  <ClipboardList size={18} />
                  Parts List
                </h3>
              </div>
              <div className="p-4">
                <CutList />
              </div>
            </div>

            {/* Cutting Diagrams */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  <Scissors size={18} />
                  Cutting Diagrams
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Optimized layout showing how to cut panels from standard
                  sheets
                </p>
              </div>
              <div className="p-4">
                <CuttingDiagram />
              </div>
            </div>

            {/* Tips */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">
                💡 Cutting Tips
              </h4>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• Allow 3mm for each cut (blade kerf)</li>
                <li>• Cut larger pieces first to minimize waste</li>
                <li>• Double-check measurements before cutting</li>
                <li>• Consider grain direction for visible surfaces</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
