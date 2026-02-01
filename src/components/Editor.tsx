import { Box, ClipboardList, PenTool } from "lucide-react";
import React, { useState } from "react";
import Canvas from "./Canvas";
import CutListView from "./CutListView";
import Preview3D from "./Preview3D";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";

type ViewTab = "design" | "3d" | "cutlist";

export default function Editor() {
  const [activeTab, setActiveTab] = useState<ViewTab>("design");

  const tabs: {
    id: ViewTab;
    label: string;
    icon: React.ReactNode;
    description: string;
  }[] = [
    {
      id: "design",
      label: "Design",
      icon: <PenTool size={18} />,
      description: "Front view for layout",
    },
    {
      id: "3d",
      label: "3D Preview",
      icon: <Box size={18} />,
      description: "Isometric preview",
    },
    {
      id: "cutlist",
      label: "Cut List",
      icon: <ClipboardList size={18} />,
      description: "Parts & optimization",
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Toolbar />

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                border-b-2 -mb-px
                ${
                  activeTab === tab.id
                    ? "text-blue-600 border-blue-600 bg-blue-50/50"
                    : "text-gray-600 border-transparent hover:text-gray-800 hover:bg-gray-50"
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}

          {/* Tab description */}
          <span className="ml-4 text-xs text-gray-400">
            {tabs.find((t) => t.id === activeTab)?.description}
          </span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "design" && (
          <>
            {/* Main canvas area */}
            <div className="flex-1 p-4 overflow-hidden">
              <div className="h-full">
                <Canvas />
              </div>
            </div>

            {/* Sidebar for properties */}
            <Sidebar />
          </>
        )}

        {activeTab === "3d" && (
          <div className="flex-1 p-4 overflow-hidden">
            <Preview3D />
          </div>
        )}

        {activeTab === "cutlist" && (
          <div className="flex-1 overflow-hidden">
            <CutListView />
          </div>
        )}
      </div>
    </div>
  );
}
