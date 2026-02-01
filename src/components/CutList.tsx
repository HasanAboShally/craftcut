import { calculateCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";

export default function CutList() {
  const { panels } = useDesignStore();
  const { pieces, totalPieces, totalArea } = calculateCutList(panels);

  if (panels.length === 0) {
    return (
      <p className="text-sm text-gray-400">Add panels to see the cut list</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-gray-500 font-medium">#</th>
            <th className="text-left py-2 px-2 text-gray-500 font-medium">
              Label
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Width
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Height
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Qty
            </th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">
              Area (m²)
            </th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((piece, index) => (
            <tr
              key={index}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="py-2 px-2 text-gray-400">{index + 1}</td>
              <td className="py-2 px-2 text-gray-800 font-medium">
                {piece.label}
              </td>
              <td className="py-2 px-2 text-right text-gray-600">
                {piece.width}
              </td>
              <td className="py-2 px-2 text-right text-gray-600">
                {piece.height}
              </td>
              <td className="py-2 px-2 text-right text-gray-600">
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
            <td colSpan={4} className="py-2 px-2 text-gray-700">
              Total
            </td>
            <td className="py-2 px-2 text-right text-gray-700">
              {totalPieces}
            </td>
            <td className="py-2 px-2 text-right text-gray-700">
              {totalArea.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
