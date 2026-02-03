import { Canvas, useThree } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useDesignStore } from "../stores/designStore";
import type { Panel } from "../types";

// Get true dimensions based on orientation (same as Canvas.tsx)
function getTrueDimensions(panel: Panel, thickness: number): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal": return { width: panel.width, height: thickness };
    case "vertical": return { width: thickness, height: panel.height };
    case "back": return { width: panel.width, height: panel.height };
    default: return { width: panel.width, height: thickness };
  }
}

// IKEA-style panel - white fill with black edges
function PrintPanel({ panel, thickness, furnitureDepth }: { 
  panel: Panel; 
  thickness: number;
  furnitureDepth: number;
}) {
  const dims = getTrueDimensions(panel, thickness);
  const orientation = panel.orientation || "horizontal";
  const panelDepth = panel.depth || furnitureDepth;
  const zAlign = panel.zAlign || "front";
  
  // Calculate position (Y-up, front view shows x-y plane)
  let position: [number, number, number];
  let boxSize: [number, number, number];
  
  // Calculate Z offset based on alignment
  const getZOffset = () => {
    switch (zAlign) {
      case "front": return panelDepth / 2;
      case "back": return furnitureDepth - panelDepth / 2;
      case "center": return furnitureDepth / 2;
      default: return panelDepth / 2;
    }
  };
  
  if (orientation === "horizontal") {
    boxSize = [dims.width, dims.height, panelDepth];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      getZOffset()
    ];
  } else if (orientation === "vertical") {
    boxSize = [dims.width, dims.height, panelDepth];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      getZOffset()
    ];
  } else {
    boxSize = [dims.width, dims.height, thickness];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      furnitureDepth - thickness / 2
    ];
  }
  
  return (
    <mesh position={position}>
      <boxGeometry args={boxSize} />
      {/* White/very light gray fill */}
      <meshBasicMaterial color="#fafafa" />
      {/* Black edges - IKEA style */}
      <Edges threshold={15} color="#333333" lineWidth={1} />
    </mesh>
  );
}

// Scene content
function PrintScene({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const { panels, settings } = useDesignStore();
  const { gl, scene, camera } = useThree();
  const hasRendered = useRef(false);
  
  const furnitureDepth = settings.furnitureDepth || 400;
  
  // Calculate bounds for camera positioning
  const bounds = {
    minX: Math.min(...panels.map(p => p.x), 0),
    maxX: Math.max(...panels.map(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      return p.x + dims.width;
    }), 100),
    minY: Math.min(...panels.map(p => p.y), 0),
    maxY: Math.max(...panels.map(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      return p.y + dims.height;
    }), 100),
  };
  
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = furnitureDepth / 2;
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const maxSize = Math.max(sizeX, sizeY, furnitureDepth);
  
  useEffect(() => {
    if (hasRendered.current) return;
    
    // Position camera for a nice isometric-like view
    const distance = maxSize * 1.8;
    camera.position.set(
      centerX + distance * 0.6,
      centerY + distance * 0.4,
      centerZ + distance * 0.8
    );
    camera.lookAt(centerX, centerY, centerZ);
    camera.updateProjectionMatrix();
    
    // Render and capture after a short delay
    const timeout = setTimeout(() => {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");
      onCapture(dataUrl);
      hasRendered.current = true;
    }, 100);
    
    return () => clearTimeout(timeout);
  }, [gl, scene, camera, centerX, centerY, centerZ, maxSize, onCapture]);
  
  return (
    <>
      {/* No lighting needed for BasicMaterial - cleaner IKEA look */}
      
      {/* Panels */}
      {panels.map(panel => (
        <PrintPanel
          key={panel.id}
          panel={panel}
          thickness={settings.thickness}
          furnitureDepth={furnitureDepth}
        />
      ))}
    </>
  );
}

interface Print3DImageProps {
  width?: number;
  height?: number;
  onImageReady?: (dataUrl: string) => void;
}

export default function Print3DImage({ width = 600, height = 400, onImageReady }: Print3DImageProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const { panels } = useDesignStore();
  
  const handleCapture = (dataUrl: string) => {
    setImageDataUrl(dataUrl);
    onImageReady?.(dataUrl);
  };
  
  if (panels.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="bg-gray-100 flex items-center justify-center text-gray-400"
      >
        No panels to render
      </div>
    );
  }
  
  // Show the captured image once ready
  if (imageDataUrl) {
    return (
      <img 
        src={imageDataUrl} 
        alt="3D furniture preview" 
        style={{ width, height, objectFit: "contain" }}
      />
    );
  }
  
  // Render the 3D scene off-screen to capture it
  return (
    <div style={{ width, height, position: "relative" }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 45, near: 1, far: 50000 }}
        style={{ background: "#ffffff" }}
      >
        <PrintScene onCapture={handleCapture} />
      </Canvas>
    </div>
  );
}
