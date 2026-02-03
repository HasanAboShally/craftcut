import { Box, ChevronLeft, ChevronRight, ClipboardList, Download, Menu, PanelRightClose, PanelRightOpen, PenTool, Plus, Printer, Trash2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { exportToCSV, exportToJSON, importFromJSON } from "../lib/export";
import { calculateCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";
import Canvas from "./Canvas";
import CutListView from "./CutListView";
import Preview3D from "./Preview3D";
import Sidebar from "./Sidebar";

type ViewTab = "design" | "3d" | "cutlist";

export default function Editor() {
  const [activeTab, setActiveTab] = useState<ViewTab>("design");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { addPanel, clearAll, panels, exportDesign, loadDesign } = useDesignStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const data = exportDesign();
    exportToJSON(data);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const { pieces } = calculateCutList(panels);
    exportToCSV(pieces);
    setShowExportMenu(false);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearAll = () => {
    if (panels.length === 0) return;
    if (confirm("Clear all panels? This cannot be undone.")) clearAll();
  };

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    { id: "design", label: "Design", icon: <PenTool size={16} /> },
    { id: "3d", label: "3D", icon: <Box size={16} /> },
    { id: "cutlist", label: "Cut List", icon: <ClipboardList size={16} /> },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Compact Header */}
      <header className="h-12 bg-slate-900 text-white flex items-center justify-between px-3 flex-shrink-0 z-50">
        {/* Left: Logo + Tabs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🪵</span>
            <span className="font-semibold text-sm">CraftCut</span>
          </div>
          
          <div className="h-6 w-px bg-slate-700" />
          
          {/* View Tabs */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-slate-900"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Quick Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={addPanel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors"
          >
            <Plus size={14} />
            Add Panel
          </button>
        </div>

        {/* Right: File Actions + Sidebar Toggle */}
        <div className="flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Import"
          >
            <Upload size={16} />
          </button>
          
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Export"
            >
              <Download size={16} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px] z-50">
                <button onClick={handleExportJSON} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                  Export JSON
                </button>
                <button onClick={handleExportCSV} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                  Export CSV
                </button>
                <button onClick={() => { window.print(); setShowExportMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                  Print
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={handleClearAll}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
            title="Clear All"
          >
            <Trash2 size={16} />
          </button>
          
          <div className="h-6 w-px bg-slate-700 mx-1" />
          
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-lg transition-colors ${sidebarOpen ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}
            title={sidebarOpen ? "Hide Panel" : "Show Panel"}
          >
            {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      {/* Click outside to close export menu */}
      {showExportMenu && <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area - Full Width */}
        <div className="flex-1 relative overflow-hidden">
          {activeTab === "design" && <Canvas />}
          {activeTab === "3d" && <Preview3D />}
          {activeTab === "cutlist" && <CutListView />}
        </div>

        {/* Collapsible Sidebar */}
        <div 
          className={`bg-white border-l border-gray-200 transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden ${
            sidebarOpen ? "w-80" : "w-0"
          }`}
        >
          {sidebarOpen && activeTab === "design" && <Sidebar />}
          {sidebarOpen && activeTab === "3d" && (
            <div className="p-4 text-sm text-gray-500">
              <h3 className="font-medium text-gray-700 mb-2">3D Preview</h3>
              <p>Orbit: drag to rotate</p>
              <p>Zoom: scroll or pinch</p>
              <p>Pan: right-click drag</p>
            </div>
          )}
          {sidebarOpen && activeTab === "cutlist" && (
            <div className="p-4 text-sm text-gray-500">
              <h3 className="font-medium text-gray-700 mb-2">Cut List</h3>
              <p>View optimized cutting layout and parts list.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
