import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useMemo } from "react";
import { calculateGroupedCutList, getPanelLetter, optimizeCuts } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";

const DIAGRAM_WIDTH = 520;
const DIAGRAM_HEIGHT = 260;

export default function CuttingDiagram() {
  const { panels, settings } = useDesignStore();

  // Get dimension-to-letter mapping (sorted by size, A = largest)
  const { dimensionToLetter } = useMemo(() => {
    return calculateGroupedCutList(
      panels,
      settings.thickness,
      settings.furnitureDepth || 400,
    );
  }, [panels, settings.thickness, settings.furnitureDepth]);

  const result = useMemo(() => {
    return optimizeCuts(
      panels, 
      settings.sheetWidth, 
      settings.sheetHeight, 
      settings.furnitureDepth || 400,
      dimensionToLetter
    );
  }, [panels, settings.sheetWidth, settings.sheetHeight, settings.furnitureDepth, dimensionToLetter]);

  if (panels.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Add panels to see the cutting diagram
      </p>
    );
  }

  // Calculate efficiency rating
  const getEfficiencyRating = (waste: number) => {
    if (waste <= 15) return { label: "Excellent", color: "text-green-600", bg: "bg-green-50" };
    if (waste <= 30) return { label: "Good", color: "text-blue-600", bg: "bg-blue-50" };
    if (waste <= 45) return { label: "Fair", color: "text-amber-600", bg: "bg-amber-50" };
    return { label: "Poor", color: "text-red-600", bg: "bg-red-50" };
  };
  
  const efficiency = getEfficiencyRating(result.totalWaste);

  const scale =
    Math.min(
      DIAGRAM_WIDTH / settings.sheetWidth,
      DIAGRAM_HEIGHT / settings.sheetHeight,
    ) * 0.95;

  const scaledSheetWidth = settings.sheetWidth * scale;
  const scaledSheetHeight = settings.sheetHeight * scale;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-2xl font-bold text-slate-800">{result.totalSheets}</div>
          <div className="text-sm text-slate-500">Sheets needed</div>
        </div>
        <div className={`rounded-lg p-4 border ${efficiency.bg} border-opacity-50`}>
          <div className={`text-2xl font-bold ${efficiency.color}`}>{100 - result.totalWaste}%</div>
          <div className="text-sm text-slate-500">Material used</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className={`text-2xl font-bold ${efficiency.color}`}>{efficiency.label}</div>
          <div className="text-sm text-slate-500">Efficiency rating</div>
        </div>
      </div>

      {/* Unplaced pieces warning */}
      {result.unplacedPieces.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle
            className="text-amber-500 flex-shrink-0 mt-0.5"
            size={18}
          />
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              Some pieces are too large for the sheet
            </p>
            <p className="text-amber-700 mt-1">
              {result.unplacedPieces.map((p) => getPanelLetter(p, settings.furnitureDepth || 400, dimensionToLetter)).join(", ")} won't fit
              on a {settings.sheetWidth}×{settings.sheetHeight}mm sheet. Consider using larger sheets.
            </p>
          </div>
        </div>
      )}

      {/* Efficiency tip */}
      {result.totalWaste > 30 && result.unplacedPieces.length === 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-blue-700">
            <strong>Tip:</strong> Adjusting panel dimensions slightly or using different sheet sizes 
            could improve material utilization.
          </p>
        </div>
      )}

      {/* Sheet Diagrams */}
      <div className="space-y-6">
        {result.sheets.map((sheet, sheetIndex) => {
          const utilization = 100 - sheet.wastePercent;
          const sheetEfficiency = getEfficiencyRating(sheet.wastePercent);
          
          return (
            <div key={sheet.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* Sheet Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 bg-slate-700 text-white text-sm font-semibold rounded-full">
                    {sheetIndex + 1}
                  </span>
                  <span className="font-medium text-slate-700">Sheet {sheetIndex + 1}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-500">
                    {sheet.placements.length} piece{sheet.placements.length !== 1 ? 's' : ''}
                  </span>
                  <span className={`font-medium ${sheetEfficiency.color}`}>
                    {utilization}% used
                  </span>
                </div>
              </div>
              
              {/* Sheet Diagram */}
              <div className="p-4 flex justify-center">
                <svg
                  width={scaledSheetWidth + 2}
                  height={scaledSheetHeight + 2}
                  className="drop-shadow-sm"
                >
                  {/* Sheet background with wood texture */}
                  <defs>
                    <pattern id={`wood-${sheet.id}`} patternUnits="userSpaceOnUse" width="200" height="200">
                      <rect width="200" height="200" fill="#f7f3ed" />
                      <line x1="0" y1="12" x2="200" y2="14" stroke="#ebe4d8" strokeWidth="1" opacity="0.7" />
                      <line x1="0" y1="38" x2="200" y2="36" stroke="#ebe4d8" strokeWidth="0.5" opacity="0.5" />
                      <line x1="0" y1="65" x2="200" y2="67" stroke="#ebe4d8" strokeWidth="1" opacity="0.7" />
                      <line x1="0" y1="95" x2="200" y2="94" stroke="#ebe4d8" strokeWidth="0.5" opacity="0.5" />
                      <line x1="0" y1="120" x2="200" y2="122" stroke="#ebe4d8" strokeWidth="1" opacity="0.7" />
                      <line x1="0" y1="150" x2="200" y2="148" stroke="#ebe4d8" strokeWidth="0.5" opacity="0.5" />
                      <line x1="0" y1="175" x2="200" y2="177" stroke="#ebe4d8" strokeWidth="1" opacity="0.7" />
                    </pattern>
                    <filter id="piece-shadow" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.15"/>
                    </filter>
                  </defs>
                  
                  {/* Sheet outline */}
                  <rect
                    x={1}
                    y={1}
                    width={scaledSheetWidth}
                    height={scaledSheetHeight}
                    fill={`url(#wood-${sheet.id})`}
                    stroke="#c4b5a0"
                    strokeWidth={1.5}
                    rx={2}
                  />

                  {/* Placed pieces */}
                  {sheet.placements.map((placement) => {
                    const x = placement.x * scale + 1;
                    const y = placement.y * scale + 1;
                    const w = placement.width * scale;
                    const h = placement.height * scale;
                    const letter = placement.letter || "?";

                    return (
                      <g key={placement.id} filter="url(#piece-shadow)">
                        {/* Panel rectangle - clean wood color */}
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="#fdfcfa"
                          stroke="#64748b"
                          strokeWidth={1.5}
                          rx={2}
                        />
                        
                        {/* Subtle inner highlight */}
                        <rect
                          x={x + 2}
                          y={y + 2}
                          width={w - 4}
                          height={h - 4}
                          fill="none"
                          stroke="#fff"
                          strokeWidth={1}
                          rx={1}
                          opacity={0.5}
                        />
                        
                        {/* Letter label badge */}
                        <circle
                          cx={x + 14}
                          cy={y + 14}
                          r={10}
                          fill="#1e3a5f"
                        />
                        <text
                          x={x + 14}
                          y={y + 18}
                          textAnchor="middle"
                          fontSize={11}
                          fill="white"
                          fontWeight="600"
                          fontFamily="system-ui, sans-serif"
                        >
                          {letter}
                        </text>
                        
                        {/* Dimensions - centered in piece */}
                        {w > 55 && h > 35 && (
                          <text
                            x={x + w / 2}
                            y={y + h / 2 + 4}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={10}
                            fill="#475569"
                            fontWeight="500"
                            fontFamily="system-ui, sans-serif"
                          >
                            {placement.width}×{placement.height}
                          </text>
                        )}
                        
                        {/* Rotation indicator */}
                        {placement.rotated && w > 45 && (
                          <g transform={`translate(${x + w - 16}, ${y + 8})`}>
                            <text
                              fontSize={11}
                              fill="#94a3b8"
                              fontFamily="system-ui, sans-serif"
                            >
                              ↻
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
        <div className="flex items-center gap-1">
          <Info size={12} />
          <span>Sheet: {settings.sheetWidth}×{settings.sheetHeight}mm • Thickness: {settings.thickness}mm</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 size={12} className="text-green-500" />
          <span>Includes 3mm kerf allowance</span>
        </div>
      </div>
    </div>
  );
}
