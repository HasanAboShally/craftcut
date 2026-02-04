import { useMemo } from "react";
import { generateAssemblySteps } from "../lib/assembly";
import { calculateGroupedCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";

interface CutListTableProps {
  variant?: "sidebar" | "print";
}

export default function CutListTable({
  variant = "sidebar",
}: CutListTableProps) {
  const { panels, settings } = useDesignStore();
  
  // Get letter labels from assembly steps (same logic as CuttingDiagram)
  const letterLabels = useMemo(() => {
    const steps = generateAssemblySteps(panels, settings);
    const labels = new Map<string, string>();
    steps.forEach((step) => {
      labels.set(step.panelId, step.letterLabel);
    });
    return labels;
  }, [panels, settings]);
  
  const { pieces, totalPieces, totalArea } = calculateGroupedCutList(
    panels,
    settings.thickness,
    settings.furnitureDepth || 400,
    letterLabels,
  );

  if (panels.length === 0) {
    return (
      <p className="text-sm text-gray-400">Add panels to see the cut list</p>
    );
  }

  if (variant === "print") {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-3">
          Pieces grouped by dimensions. Cut these from {settings.thickness}mm
          board stock.
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="text-center py-2 px-3 text-xs font-semibold">Part</th>
              <th className="text-right py-2 px-3 text-xs font-semibold">
                Length
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold">
                Width
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold">
                Thick
              </th>
              <th className="text-center py-2 px-3 text-xs font-semibold">
                Qty
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold">
                Area
              </th>
            </tr>
          </thead>
          <tbody>
            {pieces.map((item, index) => (
              <tr
                key={index}
                className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
              >
                <td className="py-2 px-3 text-sm text-center border-b border-gray-200">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-700 text-white text-xs font-semibold rounded-full">
                    {item.letter}
                  </span>
                </td>
                <td className="py-2 px-3 text-sm text-gray-700 text-right border-b border-gray-200 font-medium">
                  {item.length}mm
                </td>
                <td className="py-2 px-3 text-sm text-gray-700 text-right border-b border-gray-200">
                  {item.width}mm
                </td>
                <td className="py-2 px-3 text-sm text-gray-700 text-right border-b border-gray-200">
                  {item.thickness}mm
                </td>
                <td className="py-2 px-3 text-sm text-gray-900 text-center border-b border-gray-200 font-bold">
                  {item.qty}
                </td>
                <td className="py-2 px-3 text-sm text-gray-600 text-right border-b border-gray-200">
                  {item.area.toFixed(2)}m²
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td
                colSpan={4}
                className="py-2 px-3 text-sm text-gray-900 text-right"
              >
                Total:
              </td>
              <td className="py-2 px-3 text-sm text-gray-900 text-center">
                {totalPieces}
              </td>
              <td className="py-2 px-3 text-sm text-gray-900 text-right">
                {totalArea.toFixed(2)}m²
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // Sidebar variant
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-center py-2 px-2 text-gray-500 font-medium">Part</th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Length
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Width
            </th>
            <th className="text-center py-2 px-2 text-gray-500 font-medium">
              Qty
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Area
            </th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((piece, index) => (
            <tr
              key={index}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="py-2 px-2 text-center">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-700 text-white text-xs font-semibold rounded-full">
                  {piece.letter}
                </span>
              </td>
              <td className="py-2 px-2 text-right text-gray-600 font-medium">
                {piece.length}
              </td>
              <td className="py-2 px-2 text-right text-gray-600">
                {piece.width}
              </td>
              <td className="py-2 px-2 text-center text-gray-800 font-semibold">
                {piece.qty}
              </td>
              <td className="py-2 px-2 text-right text-gray-600">
                {piece.area.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-medium">
            <td colSpan={3} className="py-2 px-2 text-gray-700">
              Total
            </td>
            <td className="py-2 px-2 text-center text-gray-700">
              {totalPieces}
            </td>
            <td className="py-2 px-2 text-right text-gray-700">
              {totalArea.toFixed(2)}m²
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-gray-400 mt-2">
        Board thickness: {settings.thickness}mm • Grouped by cut dimensions
      </p>
    </div>
  );
}
