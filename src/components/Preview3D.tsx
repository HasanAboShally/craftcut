import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Box } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useDesignStore } from "../stores/designStore";

// Generate realistic wood grain texture with flowing lines
function createWoodTexture(baseColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Parse base color to RGB
  const hex = baseColor.replace("#", "");
  const baseR = parseInt(hex.substring(0, 2), 16);
  const baseG = parseInt(hex.substring(2, 4), 16);
  const baseB = parseInt(hex.substring(4, 6), 16);

  // Create darker and lighter variants for grain
  const darkR = Math.max(0, baseR - 40);
  const darkG = Math.max(0, baseG - 35);
  const darkB = Math.max(0, baseB - 30);

  const lightR = Math.min(255, baseR + 15);
  const lightG = Math.min(255, baseG + 12);
  const lightB = Math.min(255, baseB + 8);

  // Fill with base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Seeded random for consistent patterns
  let seed = 12345;
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Generate flowing grain lines (like your reference images)
  const numLines = 60; // Number of grain lines
  const lineSpacing = size / numLines;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Create multiple "zones" for cathedral patterns
  const cathedrals: { x: number; y: number; width: number; height: number }[] =
    [];
  for (let i = 0; i < 3; i++) {
    cathedrals.push({
      x: seededRandom() * size,
      y: seededRandom() * size,
      width: 80 + seededRandom() * 150,
      height: 150 + seededRandom() * 200,
    });
  }

  // Draw grain lines
  for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
    const baseY = lineIdx * lineSpacing + (seededRandom() - 0.5) * 4;

    // Line properties
    const lineWidth = 0.5 + seededRandom() * 1.5;
    const darkness = seededRandom();

    // Interpolate between dark grain and base color
    const r = Math.round(darkR + (baseR - darkR) * darkness * 0.7);
    const g = Math.round(darkG + (baseG - darkG) * darkness * 0.7);
    const b = Math.round(darkB + (baseB - darkB) * darkness * 0.7);

    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + seededRandom() * 0.5})`;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();

    // Start point
    let y = baseY;
    ctx.moveTo(0, y);

    // Draw flowing line across the canvas
    for (let x = 0; x <= size; x += 4) {
      // Base wave pattern
      let waveOffset = Math.sin(x * 0.01 + lineIdx * 0.3) * 8;
      waveOffset += Math.sin(x * 0.025 + lineIdx * 0.15) * 4;
      waveOffset += Math.sin(x * 0.005 + lineIdx * 0.5) * 12;

      // Add cathedral arch influence
      for (const cathedral of cathedrals) {
        const dx = x - cathedral.x;
        const dy = baseY - cathedral.y;
        const distX = dx / cathedral.width;
        const distY = dy / cathedral.height;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist < 1.5) {
          // Create arch pattern - lines curve around the cathedral center
          const influence = Math.max(0, 1 - dist) * 0.8;
          const archOffset =
            Math.sin(dist * Math.PI) * cathedral.height * 0.4 * influence;

          // Lines above cathedral center curve up, below curve down
          if (dy < 0) {
            waveOffset -= archOffset;
          } else {
            waveOffset += archOffset;
          }
        }
      }

      y = baseY + waveOffset;
      ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Sometimes add a parallel line for thicker grain bands
    if (seededRandom() > 0.7) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      y = baseY + 2;
      ctx.moveTo(0, y);

      for (let x = 0; x <= size; x += 4) {
        let waveOffset = Math.sin(x * 0.01 + lineIdx * 0.3) * 8;
        waveOffset += Math.sin(x * 0.025 + lineIdx * 0.15) * 4;
        waveOffset += Math.sin(x * 0.005 + lineIdx * 0.5) * 12;

        for (const cathedral of cathedrals) {
          const dx = x - cathedral.x;
          const dy = baseY - cathedral.y;
          const distX = dx / cathedral.width;
          const distY = dy / cathedral.height;
          const dist = Math.sqrt(distX * distX + distY * distY);

          if (dist < 1.5) {
            const influence = Math.max(0, 1 - dist) * 0.8;
            const archOffset =
              Math.sin(dist * Math.PI) * cathedral.height * 0.4 * influence;
            if (dy < 0) {
              waveOffset -= archOffset;
            } else {
              waveOffset += archOffset;
            }
          }
        }

        y = baseY + 2 + waveOffset;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Add subtle knots (darker elliptical areas)
  for (let i = 0; i < 2; i++) {
    const knotX = 80 + seededRandom() * (size - 160);
    const knotY = 80 + seededRandom() * (size - 160);
    const knotW = 20 + seededRandom() * 30;
    const knotH = knotW * (0.5 + seededRandom() * 0.3);

    // Draw concentric ellipses for knot
    for (let ring = 0; ring < 8; ring++) {
      const ringW = knotW + ring * 10;
      const ringH = knotH + ring * 8;
      const alpha = 0.15 * (1 - ring / 8);

      ctx.strokeStyle = `rgba(${darkR - 20}, ${darkG - 20}, ${darkB - 15}, ${alpha})`;
      ctx.lineWidth = 1 + seededRandom();
      ctx.beginPath();
      ctx.ellipse(knotX, knotY, ringW, ringH, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Dark center
    const gradient = ctx.createRadialGradient(
      knotX,
      knotY,
      0,
      knotX,
      knotY,
      knotW,
    );
    gradient.addColorStop(
      0,
      `rgba(${darkR - 40}, ${darkG - 40}, ${darkB - 30}, 0.6)`,
    );
    gradient.addColorStop(
      0.5,
      `rgba(${darkR - 20}, ${darkG - 20}, ${darkB - 15}, 0.3)`,
    );
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(knotX, knotY, knotW, knotH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add fine grain texture overlay
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (seededRandom() - 0.5) * 10;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);

  return texture;
}

// Single panel component with wood texture
function WoodPanel({
  position,
  size,
  color,
  woodTexture,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  woodTexture: THREE.CanvasTexture;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <mesh position={position} ref={meshRef}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={woodTexture} roughness={0.7} metalness={0.0} />
    </mesh>
  );
}

// 3D Scene with all furniture panels
function FurnitureScene({ onBoundsCalculated }: { onBoundsCalculated?: (center: [number, number, number], size: number) => void }) {
  const { panels, settings } = useDesignStore();

  const thickness = settings.thickness || 18;
  const furnitureDepth = 300; // mm
  const SCALE = 0.01; // Convert mm to scene units

  // Convert 2D panels to 3D positions and sizes
  const { panels3D, center, maxDimension } = useMemo(() => {
    if (panels.length === 0) return { panels3D: [], center: [0, 0, 0] as [number, number, number], maxDimension: 1 };

    // In 2D: internal Y increases downward (screen coords)
    // In 3D: Y increases upward (real world)
    // The visual display inverts Y, but internally panel.y is still screen coords
    
    // This must match the MIN_VISUAL_HEIGHT in Canvas.tsx
    const MIN_VISUAL_HEIGHT_2D = 80;

    // Get the VISUAL height as used in 2D canvas (with enlargement)
    const getVisualHeight = (p: (typeof panels)[0]) => {
      const orient = p.orientation || "horizontal";
      if (orient === "horizontal") return Math.max(MIN_VISUAL_HEIGHT_2D, thickness);
      return Math.max(MIN_VISUAL_HEIGHT_2D, p.height);
    };

    // Get the TRUE visible dimensions (actual physical size)
    const getTrueVisibleHeight = (p: (typeof panels)[0]) => {
      const orient = p.orientation || "horizontal";
      if (orient === "horizontal") return thickness;
      return p.height;
    };

    const getTrueVisibleWidth = (p: (typeof panels)[0]) => {
      const orient = p.orientation || "horizontal";
      if (orient === "vertical") return thickness;
      return p.width;
    };

    // Calculate bounds in 2D internal coordinates
    const minX = Math.min(...panels.map((p) => p.x));
    const maxX = Math.max(...panels.map((p) => p.x + getTrueVisibleWidth(p)));
    
    // For Y, we need to consider VISUAL positions since that's how users aligned them
    // The VISUAL bottom edge of each panel is at: panel.y + getVisualHeight(panel)
    // We use the visual bottom as the reference for alignment
    const minVisualY = Math.min(...panels.map((p) => p.y));
    const maxVisualY = Math.max(...panels.map((p) => p.y + getVisualHeight(p)));
    const totalVisualHeight = maxVisualY - minVisualY;
    
    // Calculate center in 3D space
    const widthInUnits = (maxX - minX) * SCALE;
    const heightInUnits = totalVisualHeight * SCALE;
    const depthInUnits = furnitureDepth * SCALE;
    
    const centerX = 0;
    const centerY = heightInUnits / 2;
    const centerZ = 0;
    
    const maxDim = Math.max(widthInUnits, heightInUnits, depthInUnits);

    const result = panels.map((panel) => {
      const orientation = panel.orientation || "horizontal";

      const panelW = panel.width * SCALE;
      const panelH = panel.height * SCALE;
      const panelT = thickness * SCALE;
      const depth = furnitureDepth * SCALE;

      // X position: center the design around 0
      const totalWidth = maxX - minX;
      const x3d = ((panel.x - minX) - totalWidth / 2) * SCALE;

      // Y position: In 2D, panels are positioned by their VISUAL top-left corner.
      // The VISUAL bottom of a panel is at: panel.y + visualHeight
      // In 3D, Y=0 is the floor, Y increases upward.
      // We want the VISUAL bottoms to align, and then convert to 3D.
      // 
      // VISUAL bottom in 2D = panel.y + visualHeight
      // TRUE bottom (what we show in 3D) should be at same relative position
      // 
      // In 2D coords: maxVisualY is the floor (lowest point visually on screen = highest Y value)
      // In 3D: this becomes Y=0
      // 
      // For a panel:
      //   - Its visual bottom is at panel.y + visualHeight (in 2D internal coords)
      //   - Distance from floor (maxVisualY) to visual bottom = maxVisualY - (panel.y + visualHeight)
      //   - In 3D, this becomes the Y position of the true bottom
      
      const visualHeight = getVisualHeight(panel);
      const trueHeight = getTrueVisibleHeight(panel);
      const trueWidth = getTrueVisibleWidth(panel);
      
      // Visual bottom in 2D internal coords
      const visualBottom2D = panel.y + visualHeight;
      
      // Distance from floor (maxVisualY) to visual bottom - this becomes Y position in 3D
      const distanceFromFloor = maxVisualY - visualBottom2D;
      
      // In 3D, the bottom of the TRUE box should be at distanceFromFloor
      // The center of the box is at distanceFromFloor + trueHeight/2
      const y3d = distanceFromFloor * SCALE + (trueHeight * SCALE) / 2;

      switch (orientation) {
        case "horizontal": {
          // Shelf: horizontal panel - thickness tall in 3D Y
          return {
            id: panel.id,
            position: [x3d + panelW / 2, y3d, 0] as [number, number, number],
            size: [panelW, panelT, depth] as [number, number, number],
          };
        }

        case "vertical": {
          // Side panel: vertical orientation - panel.height tall in 3D Y
          return {
            id: panel.id,
            position: [x3d + panelT / 2, y3d, 0] as [number, number, number],
            size: [panelT, panelH, depth] as [number, number, number],
          };
        }

        case "back": {
          // Back panel: at the back - panel.height tall in 3D Y
          return {
            id: panel.id,
            position: [x3d + panelW / 2, y3d, depth / 2 - panelT / 2] as [
              number,
              number,
              number,
            ],
            size: [panelW, panelH, panelT] as [number, number, number],
          };
        }

        default: {
          return {
            id: panel.id,
            position: [x3d + panelW / 2, y3d, 0] as [number, number, number],
            size: [panelW, panelT, depth] as [number, number, number],
          };
        }
      }
    });
    
    return { 
      panels3D: result, 
      center: [centerX, centerY, centerZ] as [number, number, number],
      maxDimension: maxDim
    };
  }, [panels, thickness, furnitureDepth, SCALE]);

  // Notify parent of bounds for camera positioning
  useEffect(() => {
    if (onBoundsCalculated && panels.length > 0) {
      onBoundsCalculated(center, maxDimension);
    }
  }, [center, maxDimension, onBoundsCalculated, panels.length]);

  const woodColor = settings.woodColor || "#E8D4B8";

  // Create wood texture based on color (memoized to avoid recreation)
  const woodTexture = useMemo(() => {
    return createWoodTexture(woodColor);
  }, [woodColor]);

  return (
    <>
      {/* Lighting - bright and even for accurate wood color */}
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-5, 8, -5]} intensity={0.8} />
      <directionalLight position={[0, -5, 10]} intensity={0.4} />

      {/* Render all panels */}
      {panels3D.map((panel) => (
        <WoodPanel
          key={panel.id}
          position={panel.position}
          size={panel.size}
          color={woodColor}
          woodTexture={woodTexture}
        />
      ))}

      {/* Floor grid for reference */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#e5e7eb" opacity={0.5} transparent />
      </mesh>
    </>
  );
}

// Camera controller that auto-centers on furniture
function CameraController({ target, distance }: { target: [number, number, number]; distance: number }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  
  useEffect(() => {
    if (controlsRef.current) {
      // Set the orbit target to the center of furniture
      controlsRef.current.target.set(target[0], target[1], target[2]);
      controlsRef.current.update();
    }
    
    // Position camera based on furniture size
    const cameraDistance = Math.max(distance * 3, 5);
    camera.position.set(cameraDistance, cameraDistance * 0.8, cameraDistance);
    camera.lookAt(target[0], target[1], target[2]);
  }, [target, distance, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={0.5}
      maxDistance={200}
      target={target}
      // Right-click or two-finger drag to pan
      // Left-click to rotate
      // Scroll to zoom
    />
  );
}

export default function Preview3D() {
  const { panels } = useDesignStore();
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [furnitureSize, setFurnitureSize] = useState(5);

  const handleBoundsCalculated = useCallback((center: [number, number, number], size: number) => {
    setCameraTarget(center);
    setFurnitureSize(size);
  }, []);

  // Calculate dimensions for display
  const dimensions = useMemo(() => {
    if (panels.length === 0) return { width: 0, height: 0, depth: 300 };
    const width =
      Math.max(...panels.map((p) => p.x + p.width)) -
      Math.min(...panels.map((p) => p.x));
    const height =
      Math.max(...panels.map((p) => p.y + p.height)) -
      Math.min(...panels.map((p) => p.y));
    return { width, height, depth: 300 };
  }, [panels]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Box size={18} className="text-blue-600" />
          <span className="text-sm font-medium text-gray-700">3D Preview</span>
          <span className="text-xs text-gray-500">
            Drag to rotate • Right-click drag to pan • Scroll to zoom
          </span>
        </div>
      </div>

      <div className="flex-1 bg-gradient-to-b from-slate-100 to-slate-200">
        {panels.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Box size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No panels to preview</p>
              <p className="text-sm">
                Add panels in the Design view to see them here in 3D
              </p>
            </div>
          </div>
        ) : (
          <Canvas
            camera={{ position: [15, 15, 15], fov: 50 }}
            shadows
            style={{
              background: "linear-gradient(to bottom, #f1f5f9, #e2e8f0)",
            }}
          >
            <FurnitureScene onBoundsCalculated={handleBoundsCalculated} />
            <CameraController target={cameraTarget} distance={furnitureSize} />
          </Canvas>
        )}
      </div>

      {panels.length > 0 && (
        <div className="p-2 bg-white/90 border-t border-gray-200">
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className="text-gray-600">
              <span className="font-semibold text-gray-800">
                {dimensions.width}
              </span>{" "}
              mm
            </span>
            <span className="text-gray-400">×</span>
            <span className="text-gray-600">
              <span className="font-semibold text-gray-800">
                {dimensions.height}
              </span>{" "}
              mm
            </span>
            <span className="text-gray-400">×</span>
            <span className="text-gray-600">
              <span className="font-semibold text-gray-800">
                {dimensions.depth}
              </span>{" "}
              mm
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
