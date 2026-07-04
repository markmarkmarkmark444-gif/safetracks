import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { VisualNode, VisualEdge } from '../utils/geometryMapper';
import ProofNode from './ProofNode';
import ProofEdge from './ProofEdge';

interface CanvasContainerProps {
  nodes: VisualNode[];
  edges: VisualEdge[];
  onNodeClick: (id: string) => void;
}

export default function CanvasContainer({
  nodes,
  edges,
  onNodeClick,
}: CanvasContainerProps) {
  return (
    <Canvas camera={{ position: [0, 20, 60], fov: 45 }}>
      <color attach="background" args={['#0a0f1d']} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      <pointLight position={[-20, 30, -10]} intensity={0.35} />

      <OrbitControls
        enablePan
        enableZoom
        maxDistance={100}
        minDistance={10}
      />

      <group>
        {edges.map((edge) => (
          <ProofEdge key={edge.id} edge={edge} nodes={nodes} />
        ))}

        {nodes.map((node) => (
          <ProofNode
            key={node.id}
            node={node}
            onClick={() => onNodeClick(node.id)}
          />
        ))}
      </group>
    </Canvas>
  );
}
