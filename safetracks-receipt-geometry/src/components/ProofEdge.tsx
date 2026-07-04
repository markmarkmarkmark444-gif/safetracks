import { Line } from '@react-three/drei';
import type { VisualEdge, VisualNode } from '../utils/geometryMapper';

interface ProofEdgeProps {
  edge: VisualEdge;
  nodes: VisualNode[];
}

export default function ProofEdge({ edge, nodes }: ProofEdgeProps) {
  const sourceNode = nodes.find((node) => node.id === edge.sourceId);
  const targetNode = nodes.find((node) => node.id === edge.targetId);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const points: [number, number, number][] = [
    [sourceNode.position.x, sourceNode.position.y, sourceNode.position.z],
    [targetNode.position.x, targetNode.position.y, targetNode.position.z],
  ];

  const opacity = Math.max(0.1, Math.min(0.7, edge.weight * 0.4));

  return (
    <Line
      points={points}
      color="#475569"
      lineWidth={1}
      transparent
      opacity={opacity}
    />
  );
}
