import { useMemo, useState, useEffect } from 'react';
import type { SafeTracksEvent, VisualNode, VisualEdge } from './utils/geometryMapper';
import {
  mapEventToVisualNode,
  generateEdges,
  generateMockSafeTracksEvent
} from './utils/geometryMapper';

import CanvasContainer from './components/CanvasContainer';
import LedgerFeed from './components/LedgerFeed';
import InspectorPanel from './components/InspectorPanel';
import ControlPanel from './components/ControlPanel';
import HowToReadPanel from './components/HowToReadPanel';

function seedEvents(count = 36): SafeTracksEvent[] {
  let sequence = 184000;

  return Array.from({ length: count }, () => {
    const event = generateMockSafeTracksEvent(sequence);
    sequence = event.sequence_number;
    return event;
  });
}

export default function App() {
  const [events, setEvents] = useState<SafeTracksEvent[]>(() => seedEvents());
  const [isSimulating, setIsSimulating] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('All');

  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setEvents((previousEvents) => {
        const lastSequence =
          previousEvents.length > 0
            ? previousEvents[previousEvents.length - 1].sequence_number
            : 184000;

        const newEvent = generateMockSafeTracksEvent(lastSequence);
        return [...previousEvents, newEvent].slice(-300);
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const filteredEvents = useMemo(() => {
    return events.filter(
      (event) =>
        activeFilter === 'All' || event.governance_domain === activeFilter
    );
  }, [events, activeFilter]);

  const visualNodes: VisualNode[] = useMemo(() => {
    return filteredEvents.map(mapEventToVisualNode);
  }, [filteredEvents]);

  const visualEdges: VisualEdge[] = useMemo(() => {
    return generateEdges(filteredEvents);
  }, [filteredEvents]);

  const selectedNode = visualNodes.find((node) => node.id === selectedNodeId);

  return (
    <div className="w-screen h-screen bg-[#0a0f1d] text-slate-300 font-sans overflow-hidden flex flex-col">
      <header className="p-4 border-b border-slate-800 flex justify-between items-center z-10 bg-[#0a0f1d]/85 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-wide">
            SafeTracks Receipt Geometry
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest">
            Visual Auditability Layer • Receipts, Not Records
          </p>
        </div>

        <ControlPanel
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
        />

        <button
          onClick={() => setIsSimulating(!isSimulating)}
          className={`px-4 py-2 text-sm rounded border ${
            isSimulating
              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {isSimulating ? 'LIVE RECEIPT STREAM' : 'STREAM PAUSED'}
        </button>
      </header>

      <main className="flex-1 relative flex">
        <div className="absolute inset-0">
          <CanvasContainer
            nodes={visualNodes}
            edges={visualEdges}
            onNodeClick={setSelectedNodeId}
          />
        </div>

        <div className="absolute top-4 left-4 z-10">
          <HowToReadPanel />
        </div>

        {selectedNode && (
          <div className="absolute top-4 right-4 z-10">
            <InspectorPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </main>

      <footer className="h-48 border-t border-slate-800 bg-[#0a0f1d] z-10">
        <LedgerFeed events={events} />
      </footer>
    </div>
  );
}
