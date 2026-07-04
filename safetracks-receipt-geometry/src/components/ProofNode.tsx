import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { VisualNode } from '../utils/geometryMapper';

interface ProofNodeProps {
  node: VisualNode;
  onClick: () => void;
}

export default function ProofNode({ node, onClick }: ProofNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(({ clock }) => {
    if (meshRef.current && node.intensity > 0.8) {
      const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.05;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[node.position.x, node.position.y, node.position.z]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[node.radius * (hovered ? 1.2 : 1), 16, 16]} />
      <meshStandardMaterial
        color={node.colorToken}
        emissive={node.colorToken}
        emissiveIntensity={hovered ? 1.5 : node.intensity}
        transparent
        opacity={node.intensity}
      />
    </mesh>
  );
}
