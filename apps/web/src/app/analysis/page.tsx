"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";
import dynamic from 'next/dynamic';
import Link from "next/link";
import { API_BASE_URL } from "../../config";
import LoadingOverlay from "../../components/LoadingOverlay";

// Import dynamically to avoid SSR error ("window is not defined")
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

import {
  LineChart, Line,
  BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

interface GraphNode {
  id: string;
  name: string;
  smiles: string;
  val: number; // calculated degree for size
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Simple Viridis palette for mapping node degree
function getViridisColor(val: number, minVal: number, maxVal: number) {
  if (maxVal === minVal) return "#440154"; // Fallback to base color if scale is 0
  const t = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
  const viridis = [
    "#440154", "#482878", "#3e4989", "#31688e",
    "#26828e", "#1f9e89", "#35b779", "#6ece58",
    "#b5de2b", "#fde725"
  ];
  const idx = Math.min(viridis.length - 1, Math.floor(t * viridis.length));
  return viridis[idx];
}

// ==========================================
// SIMILARITY TAB COMPONENT
// ==========================================

function SimilarityTab() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [maxDegree, setMaxDegree] = useState<number>(1);
  const [minDegree, setMinDegree] = useState<number>(0);
  const [rankData, setRankData] = useState<{rank: number, degree: number}[]>([]);
  const [histogramData, setHistogramData] = useState<{degree: number, count: number}[]>([]);
  const [fullGraphDegrees, setFullGraphDegrees] = useState<{degree: number, count: number}[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [is3D, setIs3D] = useState<boolean>(true);

  // Target Selection State
  const [targets, setTargets] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('Acetylcholinesterase');
  const [datasetType, setDatasetType] = useState<'MOLS' | 'SIMS'>('MOLS');

  // Modal State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [moleculeSvg, setMoleculeSvg] = useState<string | null>(null);
  const [svgLoading, setSvgLoading] = useState<boolean>(false);

  // References
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [needsProcessing, setNeedsProcessing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Measure container dimensions so ForceGraph gets explicit width/height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, graphData]);

  useEffect(() => {
    async function fetchTargets() {
      try {
        const res = await fetch(`${API_BASE_URL}/chembl_files`);
        if (res.ok) {
          const data = await res.json();
          const targetNames = Object.keys(data);
          setTargets(targetNames);
          if (targetNames.length > 0 && !targetNames.includes(selectedTarget)) {
            setSelectedTarget(targetNames[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load targets", e);
      }
    }
    fetchTargets();
  }, [selectedTarget]);

  useEffect(() => {
    async function loadData() {
      if (!selectedTarget) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setErrorMsg(null);
        setNeedsProcessing(false);
        const graphRes = await fetch(`${API_BASE_URL}/api/analysis/graph-data?target=${encodeURIComponent(selectedTarget)}&datasetType=${datasetType}`);
        
        if (graphRes.status === 404) {
             const json = await graphRes.json();
             if (json.needs_processing) {
                 setNeedsProcessing(true);
                 setGraphData(null);
                 setLoading(false);
                 return;
             }
        }
        
        if (!graphRes.ok) throw new Error("Failed to load graph data.");
        const graphJson = await graphRes.json();

        if (graphJson.success && graphJson.data) {
          const nodeDegree: Record<string, number> = {};
          graphJson.data.links.forEach((link: any) => {
            nodeDegree[link.source] = (nodeDegree[link.source] || 0) + 1;
            nodeDegree[link.target] = (nodeDegree[link.target] || 0) + 1;
          });

          let currentMaxDegree = 1;
          let currentMinDegree = Infinity;
          graphJson.data.nodes.forEach((node: GraphNode) => {
            node.val = nodeDegree[node.id] || 0;
            if (node.val > currentMaxDegree) currentMaxDegree = node.val;
            if (node.val < currentMinDegree) currentMinDegree = node.val;
          });
          if (currentMinDegree === Infinity) currentMinDegree = 0;
          setMaxDegree(currentMaxDegree);
          setMinDegree(currentMinDegree);

          const degreeArray = Object.values(nodeDegree).sort((a,b) => b - a);
          const rData = degreeArray.map((val, index) => ({ rank: index + 1, degree: val }));
          const degreeCounts: Record<number, number> = {};
          degreeArray.forEach(val => { degreeCounts[val] = (degreeCounts[val] || 0) + 1; });
          const hData = Object.keys(degreeCounts).map(Number).sort((a,b) => a - b).map(deg => ({ degree: deg, count: degreeCounts[deg] }));

          setRankData(rData);
          setHistogramData(hData);
          setFullGraphDegrees(graphJson.data.fullGraphDegrees || []);
          setGraphData(graphJson.data);
        }

        const plotsRes = await fetch(`${API_BASE_URL}/api/analysis/plots`);
        if (plotsRes.ok) {
          const plotsJson = await plotsRes.json();
          if (plotsJson.success && plotsJson.data) {
            const normalizedTarget = selectedTarget.replace(/\s+/g, '').toLowerCase();
            setPlots(plotsJson.data.filter((plotStr: string) => {
               const matchesTarget = plotStr.replace(/\s+/g, '').toLowerCase().includes(normalizedTarget);
               return matchesTarget; 
            }));
          }
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "An error occurred while fetching analysis data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedTarget, datasetType, refreshTrigger]);

  const handleProcessData = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg(null);
      const res = await fetch(`${API_BASE_URL}/api/analysis/process-graphs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: selectedTarget })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to process graphs.");
      
      setNeedsProcessing(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred during processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNodeClick = useCallback(async (node: GraphNode) => {
      setSelectedNode(node);
      setIsModalOpen(true);
      setMoleculeSvg(null);
      if (graphRef.current) {
        if (is3D) {
          const distance = 40;
          const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, (node as any).z || 0);
          graphRef.current.cameraPosition({ x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: ((node as any).z || 0) * distRatio }, { x: node.x || 0, y: node.y || 0, z: (node as any).z || 0 }, 2000);
        } else {
          graphRef.current.centerAt(node.x, node.y, 1000);
          graphRef.current.zoom(8, 2000);
        }
      }
      if (node.smiles) {
        setSvgLoading(true);
        try {
          const res = await fetch(`${API_BASE_URL}/api/analysis/molecule-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smiles: node.smiles })
          });
          const data = await res.json();
          if (data.success && data.svg) setMoleculeSvg(data.svg);
        } catch (err) { console.error("Failed to load SVG", err); } finally { setSvgLoading(false); }
      }
    }, [is3D]
  );

  const handleEngineStop = useCallback(() => { if (graphRef.current) graphRef.current.zoomToFit(800, 40); }, []);

  useEffect(() => {
    if (!loading && graphData && graphRef.current) {
      const t = setTimeout(() => { if (graphRef.current) graphRef.current.zoomToFit(800, 40); }, 2000);
      return () => clearTimeout(t);
    }
  }, [loading, graphData, is3D]);

  const targetNorm = selectedTarget.replace(/\s+/g, '').toLowerCase();
  const summaryImageUrl = plots.find((plotStr: string) => 
    plotStr.replace(/\s+/g, '').toLowerCase().includes(targetNorm) && 
    plotStr.includes('Tanimoto_morgan') && plotStr.includes(datasetType)
  );

  return (
    <div style={{ marginTop: '20px' }}>
        {targets.length === 0 ? (
          <div style={{ 
            backgroundColor: '#fff3cd', 
            padding: '20px', 
            borderRadius: '10px', 
            marginBottom: '30px',
            border: '1px solid #ffeeba',
            color: '#856404',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
            <div>
              <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! No data available to display graphs.</strong>
              <span>In order to view the similarity graphs, you must first download the target data on the </span>
              <Link href="/chembl" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
                ChEMBL Loader page
              </Link>
              <span>.</span>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Select Target:</label>
                <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)} style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '1rem' }}>
                  {targets.map(t => ( <option key={t} value={t}>{t}</option> ))}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Dataset Type:</label>
                <select value={datasetType} onChange={(e) => setDatasetType(e.target.value as 'MOLS' | 'SIMS')} style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '1rem' }}>
                  <option value="MOLS">Molecular Data (MOLS)</option>
                  <option value="SIMS">Similar Molecules (SIMS)</option>
                </select>
              </div>
              {summaryImageUrl && (
                <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                  <a href={`${API_BASE_URL}/api/analysis/plot/${summaryImageUrl}`} target="_blank" download style={{ padding: '8px 15px', backgroundColor: 'var(--primary-color)', color: '#fff', borderRadius: '5px', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                      <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                    </svg>
                    Download Summary ({datasetType})
                  </a>
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", marginBottom: "30px", color: "#666" }}>
              <p style={{ marginBottom: "10px" }}>Explore connections between molecules based on Tanimoto Similarity (Morgan Fingerprints).</p>
              <button onClick={() => setIs3D(!is3D)} style={{ padding: '8px 16px', backgroundColor: is3D ? '#26828e' : 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                {is3D ? 'Switch to 2D View' : 'Switch to 3D View'}
              </button>
            </div>

            {loading && <p style={{ textAlign: 'center', margin: '40px 0', fontSize: '1.2rem', color: 'var(--primary-color)' }}>Loading similarity graph...</p>}
            {errorMsg && <div className="error" style={{ maxWidth: "100%" }}>{errorMsg}</div>}

            {needsProcessing && !loading && (
              <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px dashed #ccc', marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px' }}>Similarity Data Pending</h3>
                <p style={{ marginBottom: '20px', color: '#666' }}>The graph data for {selectedTarget} is either missing or outdated. Please process the dataset to visualize the similarity graphs.</p>
                <button 
                  onClick={handleProcessData} 
                  disabled={isProcessing}
                  style={{ padding: '10px 20px', backgroundColor: isProcessing ? '#ccc' : 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '5px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
                >
                  {isProcessing ? 'Processing... (This may take a few minutes)' : 'Process Similarity Graphs'}
                </button>
              </div>
            )}

            {!loading && !needsProcessing && graphData && (
          <div ref={containerRef} style={{ height: '600px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff', position: 'relative', boxShadow: '0 4px 15px var(--shadow-color)' }}>
            {is3D ? (
              <ForceGraph3D ref={graphRef} graphData={graphData} width={containerSize.width} height={containerSize.height} nodeLabel="id" nodeColor={(node) => getViridisColor((node as GraphNode).val, minDegree, maxDegree)} nodeRelSize={4} backgroundColor="#ffffff" linkColor={() => "rgba(100, 100, 100, 0.6)"} linkWidth={(link) => (link.value * 2)} onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)} enableNodeDrag={true} cooldownTicks={150} onEngineStop={handleEngineStop} />
            ) : (
              <ForceGraph2D ref={graphRef} graphData={graphData} width={containerSize.width} height={containerSize.height} nodeLabel="id" nodeColor={(node) => getViridisColor((node as GraphNode).val, minDegree, maxDegree)} nodeRelSize={4} linkColor={() => "rgba(150, 134, 222, 0.2)"} linkWidth={(link) => (link.value * 3)} onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)} enableNodeDrag={true} enableZoomInteraction={true} cooldownTicks={150} onEngineStop={handleEngineStop} />
            )}
            <div style={{ position: 'absolute', bottom: 20, left: 20, backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: '10px 15px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '0.85rem' }}>
              <b>Legend:</b><br /><span style={{ color: '#26828e' }}>●</span> Node: Molecule (ChEMBL ID)<br />━ Edge: Similarity<br />
            </div>
            <div style={{ position: 'absolute', right: 20, bottom: 20, top: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', height: '80%', alignItems: 'center' }}>
                <div style={{ height: '100%', width: '20px', background: 'linear-gradient(to top, #440154, #482878, #3e4989, #31688e, #26828e, #1f9e89, #35b779, #6ece58, #b5de2b, #fde725)', borderRadius: '10px', border: '1px solid #ccc', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', marginLeft: '10px', fontWeight: 'bold', fontSize: '0.9rem', color: '#333' }}>
                  <span>{maxDegree}</span><span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', flex: 1, margin: 'auto 0' }}>Node Degree</span><span>{minDegree}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && rankData.length > 0 && (
          <div style={{ marginTop: '50px' }}>
            <h3 style={{ color: 'var(--primary-color)', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>Interactive Network Analysis</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Rank Plot</h4>
                 <div style={{ width: '100%', height: 300 }}><ResponsiveContainer><LineChart data={rankData} margin={{ top: 20, right: 30, left: 35, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="rank" label={{ value: 'Rank', position: 'insideBottom', offset: -10 }} /><YAxis label={{ value: 'Degree', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} /><Tooltip /><Line type="stepAfter" dataKey="degree" stroke="#5c6bc0" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Histogram</h4>
                 <div style={{ width: '100%', height: 300 }}><ResponsiveContainer><BarChart data={histogramData} margin={{ top: 20, right: 30, left: 35, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="degree" label={{ value: 'Degree', position: 'insideBottom', offset: -10 }} /><YAxis label={{ value: 'Number of Nodes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} /><Tooltip cursor={{fill: 'transparent'}} /><Bar dataKey="count" fill="#7986CB" /></BarChart></ResponsiveContainer></div>
              </div>
              <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 {(() => {
                   const allDistDegrees = [...histogramData.map(d => d.degree), ...fullGraphDegrees.map(d => d.degree)];
                   const maxDistDegree = allDistDegrees.length > 0 ? Math.max(...allDistDegrees) : maxDegree;
                   const xTicks = Array.from({ length: maxDistDegree + 1 }, (_, i) => i);
                   return (
                     <>
                       <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Distribution</h4>
                       <div style={{ width: '100%', height: 300 }}><ResponsiveContainer><ScatterChart margin={{ top: 20, right: 30, left: 35, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="degree" name="Degree" label={{ value: 'Degree', position: 'insideBottom', offset: -10 }} ticks={xTicks} domain={[0, maxDistDegree]} /><YAxis type="number" dataKey="count" name="Nodes" label={{ value: 'Number of Nodes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} /><Tooltip cursor={{strokeDasharray: '3 3'}} /><Legend verticalAlign="top" height={36} />{fullGraphDegrees.length > 0 && ( <Scatter name="Graph Degree" data={fullGraphDegrees} fill="gray" shape="circle" /> )}<Scatter name="MaxComp Degree" data={histogramData} fill="#7995c4" shape="circle" /></ScatterChart></ResponsiveContainer></div>
                     </>
                   );
                 })()}
              </div>
            </div>
          </div>
        )}
          </>
        )}

      {isModalOpen && selectedNode && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <span className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</span>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '15px', fontSize: '1.5rem', wordBreak: 'break-all' }}>{selectedNode.id}</h3>
              <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '20px', backgroundColor: '#fafafa', minHeight: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedNode.smiles ? ( svgLoading ? ( <p>Loading SVG image...</p> ) : moleculeSvg ? ( <div dangerouslySetInnerHTML={{ __html: moleculeSvg }} /> ) : ( <p style={{ color: 'red' }}>Failed to generate image.</p> ) ) : ( <p style={{ color: '#999', fontStyle: 'italic' }}>Structure (SMILES) not found in the dataset.</p> )}
              </div>
              <div style={{ marginTop: '20px', textAlign: 'left', backgroundColor: '#f2f4f8', padding: '15px', borderRadius: '5px' }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>SMILES:</p>
                <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedNode.smiles || "N/A"}</p>
                <p style={{ margin: '10px 0 0 0', fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>Node connections (Degree):</p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>{selectedNode.val} strong similarity link(s)</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ marginTop: '25px', padding: '10px 30px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Terminal = ({ logs }: { logs: string }) => (
  <div style={{ 
    textAlign: 'left',
    backgroundColor: '#0c0c0c',
    color: '#00ff41',
    padding: '20px',
    fontFamily: '"Fira Code", "Courier New", monospace',
    fontSize: '0.85rem',
    maxHeight: '400px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.4'
  }}>
    <div style={{ color: '#aaa', borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
      <span>Pipeline Terminal Output</span>
      <span style={{ color: '#4caf50', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ width: '8px', height: '8px', backgroundColor: '#4caf50', borderRadius: '50%' }}></span> Live
      </span>
    </div>
    {logs || "Terminal idle. Start a redocking task to see logs here."}
  </div>
);

// ==========================================
// REDOCKING TAB COMPONENT
// ==========================================

interface RedockingTabProps {
  onTaskStart: (id: string) => void;
  onTaskEnd: () => void;
  executionLogs: string;
  setExecutionLogs: (logs: string) => void;
  isTaskRunning: boolean;
}

function RedockingTab({ onTaskStart, onTaskEnd, executionLogs, setExecutionLogs, isTaskRunning }: RedockingTabProps) {
  const [pdbTargets, setPdbTargets] = useState<string[]>([]);
  const [availableLigands, setAvailableLigands] = useState<any[]>([]);
  const [selectedLigand, setSelectedLigand] = useState<any>(null);
  const [library, setLibrary] = useState('chembl');
  const [radius, setRadius] = useState(15.0);
  const [exhaustiveness, setExhaustiveness] = useState(8);
  const [prepareComplex, setPrepareComplex] = useState(true);
  const [chargeType, setChargeType] = useState('am1');
  const [selectedTarget, setSelectedTarget] = useState("");
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  
  // Results states
  const [availableResults, setAvailableResults] = useState<string[]>([]);
  const [activeResultTarget, setActiveResultTarget] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<{headers: string[], rows: any[]} | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Fetch PDB targets and existing results
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [targetsRes, resultsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/redocking/targets?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/api/redocking/results?t=${Date.now()}`)
        ]);
        
        if (targetsRes.ok) {
          const targets = await targetsRes.json();
          setPdbTargets(targets);
          if (targets.length > 0) setSelectedTarget(targets[0]);
        }
        
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          setAvailableResults(results);
          if (results.length > 0 && !activeResultTarget) {
            setActiveResultTarget(results[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch redocking data", err);
      }
    };
    fetchData();
  }, []);

  // Fetch specific result data when active target changes
  useEffect(() => {
    if (activeResultTarget) {
      const fetchResultCsv = async () => {
        setLoadingResults(true);
        try {
          const res = await fetch(`${API_BASE_URL}/api/redocking/csv/${activeResultTarget}`);
          if (res.ok) {
            const data = await res.json();
            setResultsData({ headers: data.headers, rows: data.rows });
          }
        } catch (err) {
          console.error("Failed to fetch result CSV", err);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResultCsv();
    }
  }, [activeResultTarget]);

  // Polling for task status and logs
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (runningTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/redocking/status/${runningTaskId}`);
          if (res.ok) {
            const data = await res.json();
            setTaskStatus(data);
            setExecutionLogs(data.logs || "");
            
            if (data.status === 'completed' || data.status === 'error') {
              setRunningTaskId(null);
              onTaskEnd();
              // Refresh available results
              const resultsRes = await fetch(`${API_BASE_URL}/api/redocking/results?t=${Date.now()}`);
              if (resultsRes.ok) {
                const results = await resultsRes.json();
                setAvailableResults(results);
                if (data.status === 'completed') setActiveResultTarget(selectedTarget);
              }
            }
          }
        } catch (err) {
          console.error("Error polling status", err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [runningTaskId]);

  const runRedocking = async () => {
    if (!selectedTarget) return;
    try {
      setExecutionLogs("");
      setTaskStatus({ status: 'starting', message: 'Initializing task...' });
      const res = await fetch(`${API_BASE_URL}/api/redocking/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: selectedTarget, charge_type: chargeType, prepare_complex: prepareComplex })
      });
      
      if (res.ok) {
        const data = await res.json();
        setRunningTaskId(data.task_id);
        onTaskStart(data.task_id);
      } else {
        const error = await res.json();
        setTaskStatus({ status: 'error', message: error.message });
      }
    } catch (err) {
      setTaskStatus({ status: 'error', message: "Failed to start redocking task." });
    }
  };

  const downloadCsv = () => {
    if (activeResultTarget) {
      window.open(`${API_BASE_URL}/api/redocking/download/${activeResultTarget}`, '_blank');
    }
  };

  return (
    <div style={{ marginTop: '20px' }}>
      {pdbTargets.length === 0 && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! No PDB targets available.</strong>
            <span>You must first download at least one target on the </span>
            <Link href="/pdb" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
              PDB Search page
            </Link>
            <span> before you can perform a redocking simulation.</span>
          </div>
        </div>
      )}
      <div style={{ 
        backgroundColor: '#fff', 
        padding: '25px', 
        borderRadius: '12px', 
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
        border: '1px solid #eee',
        marginBottom: '30px'
      }}>
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '20px' }}>Redocking Parameters (AutoDock Vina)</h3>
        
        <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Target Folder:</label>
            <select 
              value={selectedTarget} 
              onChange={(e) => setSelectedTarget(e.target.value)} 
              disabled={isTaskRunning}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              {pdbTargets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Charge Type:</label>
            <select 
              value={chargeType} 
              onChange={(e) => setChargeType(e.target.value)}
              disabled={isTaskRunning}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="am1">AM1 (Recommended)</option>
              <option value="gas">Gasteiger</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '10px' }}>
            <input 
              type="checkbox" 
              id="prepComp" 
              checked={prepareComplex} 
              onChange={(e) => setPrepareComplex(e.target.checked)}
              disabled={isTaskRunning}
              style={{ width: '18px', height: '18px', marginRight: '10px' }}
            />
            <label htmlFor="prepComp" style={{ fontWeight: 'bold', cursor: 'pointer' }}>Prepare Complex</label>
          </div>

          <button 
            onClick={runRedocking} 
            disabled={isTaskRunning || !selectedTarget}
            style={{ 
              padding: '12px 30px', 
              backgroundColor: 'var(--primary-color)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 'bold',
              cursor: 'pointer',
              opacity: (isTaskRunning || !selectedTarget) ? 0.6 : 1,
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            {isTaskRunning ? 'Running...' : 'Run Redocking'}
          </button>
        </div>
      </div>

      {taskStatus?.status === 'error' && (
        <div className="error" style={{ marginBottom: '30px' }}>
          <strong>Error:</strong> {taskStatus.message}
        </div>
      )}

      {/* RESULTS SECTION WITH TABS */}
      {availableResults.length > 0 && (
        <div style={{ marginTop: '50px' }}>
          <h3 style={{ color: 'var(--primary-color)', marginBottom: '20px' }}>Simulation Results</h3>
          
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '25px', gap: '5px', overflowX: 'auto' }}>
            {availableResults.map(target => (
              <button 
                key={target}
                onClick={() => setActiveResultTarget(target)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: activeResultTarget === target ? '#f3f0ff' : 'transparent',
                  color: activeResultTarget === target ? '#6b46c1' : '#666',
                  border: 'none',
                  borderBottom: activeResultTarget === target ? '3px solid #6b46c1' : '3px solid transparent',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                {target}
              </button>
            ))}
          </div>

          {activeResultTarget && (
            <div style={{ 
              backgroundColor: '#fff', 
              padding: '25px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
              border: '1px solid #eee'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h4 style={{ margin: 0, color: '#333' }}>Target: {activeResultTarget}</h4>
                <button 
                  onClick={downloadCsv}
                  style={{ 
                    padding: '10px 25px', 
                    backgroundColor: '#6b46c1', // Purple as requested
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 2px 4px rgba(107, 70, 193, 0.3)'
                  }}
                >
                  <i className="fas fa-download"></i> Download CSV
                </button>
              </div>

              {/* REDOCKING RESULTS TABLE */}
              {loadingResults ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading result table...</p>
              ) : resultsData ? (
                <div style={{ marginBottom: '40px', position: 'relative' }}>
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', maxHeight: isTableExpanded ? 'none' : '400px', overflowY: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                          {resultsData.headers.map((h, idx) => <th key={idx} style={{ padding: '14px 16px', textAlign: 'left', color: '#374151', fontWeight: 600, fontSize: '0.95rem' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {resultsData.rows.slice(0, isTableExpanded ? resultsData.rows.length : 5).map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            {row.map((cell: any, j: number) => <td key={j} style={{ padding: '12px 16px', color: '#4b5563', fontSize: '0.9rem' }}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {!isTableExpanded && resultsData.rows.length > 5 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px',
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1) 80%)',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '10px'
                    }}>
                      <button onClick={() => setIsTableExpanded(true)} style={{ padding: '8px 16px', backgroundColor: '#fff', color: 'var(--primary-color)', border: '2px solid var(--primary-color)', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
                        <i className="fas fa-chevron-down"></i> Show more ({resultsData.rows.length - 5} remaining)
                      </button>
                    </div>
                  )}
                  {isTableExpanded && resultsData.rows.length > 5 && (
                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                      <button onClick={() => setIsTableExpanded(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>Show less</button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No result data available for this target.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// ADMET TAB COMPONENT
// ==========================================

interface AdmetTabProps {
  onTaskStart: (id: string) => void;
  onTaskEnd: () => void;
  executionLogs: string;
  setExecutionLogs: (logs: string) => void;
  isTaskRunning: boolean;
}

// Group type returned by the API
interface AdmetGroup {
  group: 'MOLS' | 'SIMS' | 'FULL';
  headers: string[];
  rows: any[][];
  summary: { total: number; bbb_plus: number; bbb_minus: number; hia_plus: number; pgp_plus: number };
}

function AdmetTab({ onTaskStart, onTaskEnd, executionLogs, setExecutionLogs, isTaskRunning }: AdmetTabProps) {
  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");

  // Task state (async pipeline)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Results state — now grouped (MOLS / SIMS / FULL)
  const [groups, setGroups] = useState<AdmetGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<'MOLS' | 'SIMS' | 'FULL'>('FULL');
  const [plots, setPlots] = useState<string[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Expansion states
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [isEggsExpanded, setIsEggsExpanded] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // Molecule Modal states
  const [selectedMolecule, setSelectedMolecule] = useState<{id: string, smiles: string} | null>(null);
  const [moleculeSvg, setMoleculeSvg] = useState<string | null>(null);
  const [molecule3DBlock, setMolecule3DBlock] = useState<string | null>(null);
  const [svgLoading, setSvgLoading] = useState(false);

  // Derived: the currently-active group data
  const currentGroup = groups.find(g => g.group === activeGroup) ?? groups[0] ?? null;

  // Fetch available ChEMBL targets that have molecules
  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admet/available-targets`);
        if (res.ok) {
          const targets: string[] = await res.json();
          setAvailableTargets(targets);
          if (targets.length > 0) setSelectedTarget(targets[0]);
        }
      } catch (e) {
        console.error("Failed to load available targets", e);
      }
    };
    fetchTargets();
  }, []);

  // Load existing results whenever target changes
  useEffect(() => {
    if (!selectedTarget || isRunning) return;
    loadResultsForTarget(selectedTarget);
  }, [selectedTarget]);

  // Polling for task status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (runningTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/admet/status/${runningTaskId}`);
          if (res.ok) {
            const data = await res.json();
            setTaskStatus(data);
            setExecutionLogs(data.logs || "");
            if (data.status === 'completed' || data.status === 'error') {
              setRunningTaskId(null);
              setIsRunning(false);
              onTaskEnd();
              if (data.status === 'completed') loadResultsForTarget(selectedTarget);
            }
          }
        } catch (err) {
          console.error("Error polling ADMET status", err);
        }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [runningTaskId, selectedTarget]);

  const loadResultsForTarget = async (target: string) => {
    if (!target) return;
    setLoadingResults(true);
    setErrorMsg(null);
    try {
      const [csvRes, plotsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admet/csv/${encodeURIComponent(target)}`),
        fetch(`${API_BASE_URL}/api/admet/plots/${encodeURIComponent(target)}`)
      ]);
      if (csvRes.ok) {
        const d = await csvRes.json();
        if (d.status === 'success' && d.groups?.length > 0) {
          setGroups(d.groups as AdmetGroup[]);
          // Default to FULL if available, otherwise first group
          const has_full = d.groups.some((g: AdmetGroup) => g.group === 'FULL');
          setActiveGroup(has_full ? 'FULL' : d.groups[0].group);
        } else {
          setGroups([]);
        }
      } else {
        setGroups([]);
      }
      if (plotsRes.ok) {
        const p: string[] = await plotsRes.json();
        setPlots(p);
      }
    } catch (e) {
      console.error("Failed to load ADMET results", e);
    } finally {
      setLoadingResults(false);
    }
  };

  const runAdmet = async () => {
    if (!selectedTarget) return;
    setTaskStatus({ status: 'starting', message: 'Initializing ADMET pipeline...' });
    setExecutionLogs("");
    setIsRunning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admet/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: selectedTarget })
      });
      if (res.ok) {
        const d = await res.json();
        setRunningTaskId(d.task_id);
        onTaskStart(d.task_id);
      } else {
        const err = await res.json();
        setTaskStatus({ status: 'error', message: err.message });
        setIsRunning(false);
        onTaskEnd();
      }
    } catch (e) {
      setTaskStatus({ status: 'error', message: 'Failed to start ADMET task.' });
      setIsRunning(false);
      onTaskEnd();
    }
  };

  const downloadImage = (plotFile: string) => {
    const url = `${API_BASE_URL}/api/admet/plot/${encodeURIComponent(selectedTarget)}/${encodeURIComponent(plotFile)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = plotFile;
    
    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const objectUrl = window.URL.createObjectURL(blob);
        a.href = objectUrl;
        a.click();
        window.URL.revokeObjectURL(objectUrl);
      })
      .catch(err => {
        console.error("Failed to download image", err);
        a.target = '_blank';
        a.click();
      });
  };

  const downloadAllImages = () => {
    plots.forEach(plotFile => downloadImage(plotFile));
  };

  const openMoleculeModal = async (id: string, smiles: string) => {
    setSelectedMolecule({ id, smiles });
    setMoleculeSvg(null);
    setMolecule3DBlock(null);
    setSvgLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/analysis/molecule-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setMoleculeSvg(d.svg);
          setMolecule3DBlock(d.molBlock);
          
          if (d.molBlock) {
            setTimeout(() => {
              const element = document.getElementById('viewer-3d-canvas-admet');
              if (element && (window as any).$3Dmol) {
                element.innerHTML = '';
                let v = (window as any).$3Dmol.createViewer(element, { backgroundColor: 'white' });
                v.addModel(d.molBlock, "sdf");
                v.setStyle({}, { stick: {} });
                v.zoomTo(); v.render();
              }
            }, 200);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load molecule SVG", e);
    } finally {
      setSvgLoading(false);
    }
  };

  const downloadCsv = () => {
    if (selectedTarget && currentGroup)
      window.open(`${API_BASE_URL}/api/admet/download/${encodeURIComponent(selectedTarget)}/${currentGroup.group}`, '_blank');
  };

  // ── Render ──────────────────────────────────────────────────────────

  // Empty state: no ChEMBL data downloaded yet
  if (availableTargets.length === 0) {
    return (
      <div style={{ marginTop: '20px' }}>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          boxShadow: '0 2px 8px rgba(133,100,4,0.08)'
        }}>
          <i className="fas fa-flask" style={{ fontSize: '2rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.15rem', marginBottom: '6px' }}>
              No ChEMBL molecules found.
            </strong>
            <span>To run ADMET analysis, you first need to download bioactivity data on the </span>
            <Link href="/chembl" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
              ChEMBL Loader page
            </Link>
            <span>. Once molecules are downloaded, return here to evaluate their pharmacokinetic properties.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '20px' }}>

      {/* ── Controls ── */}
      <div style={{
        backgroundColor: '#fff',
        padding: '25px',
        borderRadius: '12px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
        border: '1px solid #eee',
        marginBottom: '30px'
      }}>
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '20px' }}>ADMET Analysis Parameters</h3>
        <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>ChEMBL Target:</label>
            <select
              value={selectedTarget}
              onChange={(e) => { setSelectedTarget(e.target.value); setGroups([]); setPlots([]); setIsTableExpanded(false); setIsEggsExpanded(false); }}
              disabled={isRunning}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              {availableTargets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <button
            id="admet-run-btn"
            onClick={runAdmet}
            disabled={isRunning || !selectedTarget}
            style={{
              padding: '12px 30px',
              backgroundColor: isRunning ? '#ccc' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <i className="fas fa-dna"></i>
            {isRunning ? 'Running ADMET...' : 'Run ADMET Analysis'}
          </button>
        </div>

        {/* Status badge */}
        {taskStatus && (
          <div style={{
            marginTop: '18px',
            padding: '10px 16px',
            borderRadius: '6px',
            backgroundColor: taskStatus.status === 'error' ? '#fff0f0' : taskStatus.status === 'completed' ? '#f0fff4' : '#f0f4ff',
            border: `1px solid ${taskStatus.status === 'error' ? '#ffcccc' : taskStatus.status === 'completed' ? '#b7f5d8' : '#c3d4ff'}`,
            color: taskStatus.status === 'error' ? '#c00' : taskStatus.status === 'completed' ? '#155724' : '#004080',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {taskStatus.status === 'running' && (
              <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6', animation: 'pulse 1.5s infinite' }}></span>
            )}
            {taskStatus.status === 'completed' && <i className="fas fa-check-circle"></i>}
            {taskStatus.status === 'error' && <i className="fas fa-times-circle"></i>}
            {taskStatus.message}
          </div>
        )}
      </div>



      {/* ── Error message ── */}
      {taskStatus?.status === 'error' && (
        <div className="error" style={{ marginBottom: '30px' }}>
          <strong>Error:</strong> {taskStatus.message}
        </div>
      )}

      {/* ── Results ── */}
      {loadingResults && <p style={{ textAlign: 'center', padding: '40px', color: 'var(--primary-color)' }}>Loading ADMET results...</p>}

      {!loadingResults && groups.length > 0 && currentGroup && (
        <div>
          {/* Summary cards */}
          <h3 style={{ color: 'var(--primary-color)', marginBottom: '16px' }}>Results — {selectedTarget}</h3>

          {/* Group tabs: MOLS / SIMS / FULL */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', borderBottom: '2px solid #eee', paddingBottom: '0' }}>
            {groups.map(g => (
              <button
                key={g.group}
                onClick={() => { setActiveGroup(g.group); setIsTableExpanded(false); }}
                style={{
                  padding: '9px 22px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  border: 'none',
                  borderBottom: activeGroup === g.group ? '3px solid var(--primary-color)' : '3px solid transparent',
                  backgroundColor: activeGroup === g.group ? '#f0f4ff' : 'transparent',
                  color: activeGroup === g.group ? 'var(--primary-color)' : '#777',
                  cursor: 'pointer',
                  borderRadius: '6px 6px 0 0',
                  transition: 'all 0.15s',
                }}
              >
                {g.group} <span style={{ fontWeight: 'normal', fontSize: '0.8rem', marginLeft: '4px', opacity: 0.7 }}>({g.summary.total})</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px', marginBottom: '30px' }}>
            {[
              { label: 'Total Processed', value: currentGroup.summary.total, color: '#6366f1', icon: 'fa-atom', tooltip: 'Total number of molecules processed in this analysis' },
              { label: 'BBB+', value: currentGroup.summary.bbb_plus, color: '#ef4444', icon: 'fa-brain', tooltip: 'Blood-Brain Barrier (+): The molecule can penetrate the brain.' },
              { label: 'BBB−', value: currentGroup.summary.bbb_minus, color: '#3b82f6', icon: 'fa-circle-xmark', tooltip: 'Blood-Brain Barrier (-): The molecule cannot penetrate the brain.' },
              { label: 'HIA+', value: currentGroup.summary.hia_plus, color: '#10b981', icon: 'fa-pills', tooltip: 'Human Intestinal Absorption (+): High probability of being absorbed by the intestine.' },
              { label: 'PGP+', value: currentGroup.summary.pgp_plus, color: '#f59e0b', icon: 'fa-shield-halved', tooltip: 'P-glycoprotein (+): Molecule interacts with P-glycoprotein efflux pump.' },
            ].map(card => (
              <div key={card.label} title={card.tooltip ?? ''} style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                border: `1px solid ${card.color}22`,
                cursor: card.tooltip ? 'help' : 'default'
              }}>
                <i className={`fas ${card.icon}`} style={{ fontSize: '1.5rem', color: card.color, marginBottom: '8px', display: 'block' }}></i>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: card.color }}>{card.value}</div>
                <div style={{ fontSize: '0.8rem', color: '#777', marginTop: '4px' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Results table */}
          <div style={{
            backgroundColor: '#fff', borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #eee', padding: '25px',
            marginBottom: '30px', position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0 }}>Detailed Results — {activeGroup} ({currentGroup.rows.length} molecules)</h4>
              <button
                id="admet-download-btn"
                onClick={downloadCsv}
                style={{
                  padding: '10px 22px', backgroundColor: '#6366f1', color: 'white',
                  border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: '0 2px 4px rgba(99,102,241,0.3)'
                }}
              >
                <i className="fas fa-download"></i> Download CSV
              </button>
            </div>
            
            <div style={{
              position: 'relative',
              maxHeight: isTableExpanded ? 'none' : '300px',
              overflow: 'hidden',
              transition: 'max-height 0.3s ease-in-out'
            }}>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                      {currentGroup.headers.map(h => {
                        let tooltip = "";
                        if (h === "MW") tooltip = "Molecular Weight: Very heavy molecules (usually > 500 Da) have more difficulty being absorbed by the body.";
                        else if (h === "WLOGP") tooltip = "Partition Coefficient: A measure of lipophilicity. Balanced values are ideal for the drug to cross lipid cell membranes but also dissolve in aqueous blood.";
                        else if (h === "TPSA") tooltip = "Topological Polar Surface Area: Sum of the surfaces of polar atoms. Lower values generally indicate better ability to penetrate membranes.";
                        else if (h === "HBD") tooltip = "Number of hydrogen bond donors.";
                        else if (h === "HBA") tooltip = "Number of hydrogen bond acceptors.";
                        else if (h === "RB") tooltip = "Rotatable Bonds: Measures the flexibility of the molecule. Too flexible molecules may have difficulty binding firmly to a target.";
                        else if (h === "BBB") tooltip = "Blood-Brain Barrier penetration prediction (BBB+ or BBB-).";
                        else if (h === "HIA") tooltip = "Human Intestinal Absorption prediction (HIA+ or HIA-).";
                        else if (h === "PGP") tooltip = "P-glycoprotein substrate prediction (PGP+ or PGP-).";

                        return (
                          <th key={h} title={tooltip} style={{ padding: '12px 15px', textAlign: 'left', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', cursor: tooltip ? 'help' : 'default' }}>{h}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {currentGroup.rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f9f9f9', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fafafe')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {row.map((cell: any, j: number) => {
                          const header = currentGroup.headers[j];
                          let badgeColor = '';
                          if (cell === 'BBB+') badgeColor = '#ef4444';
                          else if (cell === 'BBB-') badgeColor = '#3b82f6';
                          else if (cell === 'HIA+') badgeColor = '#10b981';
                          else if (cell === 'HIA-') badgeColor = '#6b7280';
                          else if (cell === 'PGP+') badgeColor = '#f59e0b';
                          else if (cell === 'PGP-') badgeColor = '#9ca3af';
                          return (
                            <td key={j} style={{ padding: '10px 15px', color: '#666', fontSize: '0.88rem' }}>
                              {badgeColor ? (
                                <span style={{
                                  backgroundColor: badgeColor + '18', color: badgeColor,
                                  padding: '3px 8px', borderRadius: '12px', fontWeight: '600', fontSize: '0.8rem'
                                }}>{cell}</span>
                              ) : (
                                header === 'canonical_smiles'
                                  ? <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#888' }} title={String(cell)}>{String(cell).slice(0, 25)}{String(cell).length > 25 ? '…' : ''}</span>
                                  : header === 'molecule_chembl_id'
                                    ? <button 
                                        title="Click to view 2D/3D structure"
                                        onClick={() => openMoleculeModal(cell, row[currentGroup.headers.indexOf('canonical_smiles')])}
                                        style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
                                      >{cell}</button>
                                    : cell
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {!isTableExpanded && currentGroup.rows.length > 5 && (
                <div style={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0, height: '150px',
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1) 80%)',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '10px'
                }}>
                  <button
                    onClick={() => setIsTableExpanded(true)}
                    style={{
                      padding: '10px 20px', backgroundColor: '#fff', color: 'var(--primary-color)',
                      border: '2px solid var(--primary-color)', borderRadius: '20px', cursor: 'pointer',
                      fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10
                    }}
                  >
                    <i className="fas fa-chevron-down"></i> Click here to see the full content
                  </button>
                </div>
              )}
            </div>
            
            {isTableExpanded && (
               <div style={{ textAlign: 'center', marginTop: '15px' }}>
                 <button onClick={() => setIsTableExpanded(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>Show less</button>
               </div>
            )}
          </div>

          {/* BOILED-Egg plots */}
          {plots.length > 0 && (
            <div style={{ marginBottom: '30px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 
                  style={{ color: '#555', margin: 0, cursor: 'help' }}
                  title="BOILED-Egg: lipophilicity (WLOGP) vs. polarity (TPSA). Yellow = BBB+, White = HIA+."
                >
                  BOILED-Egg Plots (MOLS / SIMS / FULL) <i className="fas fa-info-circle" style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '5px' }}></i>
                </h4>
                <button
                  onClick={downloadAllImages}
                  style={{
                    padding: '8px 16px', backgroundColor: '#fff', color: '#6366f1',
                    border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
                >
                  <i className="fas fa-images"></i> Download All Images
                </button>
              </div>
              <div style={{
                position: 'relative',
                maxHeight: isEggsExpanded ? 'none' : '400px',
                overflow: 'hidden',
                transition: 'max-height 0.3s ease-in-out'
              }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {plots.map(plotFile => (
                    <div key={plotFile} style={{
                      border: '1px solid #eee', borderRadius: '12px', padding: '10px',
                      backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                      flex: '1', minWidth: '320px'
                    }}>
                      <img
                        src={`${API_BASE_URL}/api/admet/plot/${encodeURIComponent(selectedTarget)}/${encodeURIComponent(plotFile)}`}
                        alt={`BOILED-Egg plot — ${plotFile}`}
                        title="Click to enlarge"
                        onClick={() => setEnlargedImage(plotFile)}
                        style={{ width: '100%', borderRadius: '8px', cursor: 'zoom-in', transition: 'transform 0.2s ease-in-out' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <p style={{ fontSize: '0.8rem', color: '#999', margin: 0 }}>{plotFile}</p>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <a
                            href={`${API_BASE_URL}/api/admet/plot/${encodeURIComponent(selectedTarget)}/${encodeURIComponent(plotFile)}`}
                            download={plotFile}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '4px', textDecoration: 'none' }}
                            title="Download Image"
                          >
                            <i className="fas fa-download"></i>
                          </a>
                          <button
                            onClick={() => setEnlargedImage(plotFile)}
                            style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '4px' }}
                            title="Expand"
                          >
                            <i className="fas fa-expand-arrows-alt"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {!isEggsExpanded && plots.length > 3 && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0, height: '200px',
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1) 80%)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '20px'
                  }}>
                    <button
                      onClick={() => setIsEggsExpanded(true)}
                      style={{
                        padding: '10px 20px', backgroundColor: '#fff', color: 'var(--primary-color)',
                        border: '2px solid var(--primary-color)', borderRadius: '20px', cursor: 'pointer',
                        fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10
                      }}
                    >
                      <i className="fas fa-chevron-down"></i> Click here to see all plots
                    </button>
                  </div>
                )}
              </div>
              
              {isEggsExpanded && (
                <div style={{ textAlign: 'center', marginTop: '15px' }}>
                  <button onClick={() => setIsEggsExpanded(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>Show less</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No results yet message */}
      {!loadingResults && groups.length === 0 && !isRunning && (
        <div style={{
          textAlign: 'center', padding: '50px 20px',
          backgroundColor: '#f8f9fa', borderRadius: '12px',
          border: '1px dashed #ddd', color: '#999'
        }}>
          <i className="fas fa-dna" style={{ fontSize: '3rem', marginBottom: '15px', display: 'block', opacity: 0.3 }}></i>
          <p style={{ fontSize: '1.1rem' }}>No ADMET results for <strong>{selectedTarget}</strong> yet.</p>
          <p style={{ fontSize: '0.9rem' }}>Click <strong>Run ADMET Analysis</strong> to compute pharmacokinetic properties.</p>
        </div>
      )}

      {/* Enlarged Image Modal */}
      {enlargedImage && (
        <div 
          onClick={() => setEnlargedImage(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px',
            backdropFilter: 'blur(5px)'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <button 
              onClick={() => setEnlargedImage(null)}
              style={{
                position: 'absolute', top: '-40px', right: 0,
                background: 'none', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer',
                lineHeight: 1
              }}
              title="Close"
            >
              &times;
            </button>
            <img 
              src={`${API_BASE_URL}/api/admet/plot/${encodeURIComponent(selectedTarget)}/${encodeURIComponent(enlargedImage)}`}
              alt="Enlarged Plot"
              style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 60px)', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
            />
            <div style={{ marginTop: '15px', display: 'flex', gap: '15px', alignItems: 'center' }}>
              <p style={{ color: 'white', margin: 0, fontSize: '1.1rem', fontWeight: '500' }}>{enlargedImage}</p>
              <button
                onClick={() => downloadImage(enlargedImage)}
                style={{
                  padding: '8px 16px', backgroundColor: '#6366f1', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
                }}
              >
                <i className="fas fa-download"></i> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Molecule 2D/3D Modal */}
      {selectedMolecule && (
        <div 
          onClick={() => setSelectedMolecule(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              position: 'relative', width: '95%', maxWidth: '1000px', backgroundColor: '#fff',
              borderRadius: '16px', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' 
            }}
          >
            <span 
              onClick={() => setSelectedMolecule(null)} 
              style={{ position: 'absolute', top: '20px', right: '25px', fontSize: '1.5rem', cursor: 'pointer', color: '#888' }}
            >
              &times;
            </span>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '15px', fontSize: '1.5rem', wordBreak: 'break-all' }}>
                {selectedMolecule.id}
              </h3>
              
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'nowrap', justifyContent: 'center', overflowX: 'auto' }}>
                <div style={{ flex: '1 1 50%', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', backgroundColor: '#fafafa', minHeight: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <h4 style={{ marginBottom: '10px', color: '#555' }}>2D Structure</h4>
                  {selectedMolecule.smiles ? ( 
                    svgLoading ? ( 
                      <p>Loading SVG image...</p> 
                    ) : moleculeSvg ? ( 
                      <div dangerouslySetInnerHTML={{ __html: moleculeSvg }} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} /> 
                    ) : ( 
                      <p style={{ color: 'red' }}>Failed to generate image.</p> 
                    ) 
                  ) : ( 
                    <p style={{ color: '#999', fontStyle: 'italic' }}>Structure (SMILES) not found in the dataset.</p> 
                  )}
                </div>

                <div style={{ flex: '1 1 50%', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', backgroundColor: '#fafafa', minHeight: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <h4 style={{ marginBottom: '10px', color: '#555' }}>3D Structure</h4>
                  <div id="viewer-3d-canvas-admet" style={{ width: '100%', height: '300px', position: 'relative' }}></div>
                  {!svgLoading && !molecule3DBlock && (
                    <p style={{ color: 'red', marginTop: '10px' }}>Failed to generate 3D structure.</p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '20px', textAlign: 'left', backgroundColor: '#f2f4f8', padding: '15px', borderRadius: '5px' }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>SMILES:</p>
                <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedMolecule.smiles || "N/A"}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedMolecule(null)} 
                style={{ 
                  marginTop: '25px', padding: '10px 30px', backgroundColor: 'var(--primary-color)', 
                  color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' 
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// DOCKING TAB COMPONENT
// ==========================================

interface DockingTabProps {
  onTaskStart: (id: string) => void;
  onTaskEnd: () => void;
  executionLogs: string;
  setExecutionLogs: (logs: string) => void;
  isTaskRunning: boolean;
}

function DockingTab({ onTaskStart, onTaskEnd, executionLogs, setExecutionLogs, isTaskRunning }: DockingTabProps) {
  const [pdbTargets, setPdbTargets] = useState<string[]>([]);
  const [chemblTargets, setChemblTargets] = useState<string[]>([]);
  const [zincTargets, setZincTargets] = useState<string[]>([]);
  const [targetsWithRedocking, setTargetsWithRedocking] = useState<string[]>([]);
  const [targetsWithAdmet, setTargetsWithAdmet] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [availableLigands, setAvailableLigands] = useState<any[]>([]);
  const [selectedLigand, setSelectedLigand] = useState<any>(null); // Should hold the array [Residue, Name, Number, Chain]
  const [library, setLibrary] = useState("chembl");
  const [prepareComplex, setPrepareComplex] = useState(true);
  const [chargeType, setChargeType] = useState("am1");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  
  // Results states
  const [availableResults, setAvailableResults] = useState<string[]>([]);
  const [activeResultTarget, setActiveResultTarget] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<{headers: string[], rows: any[]} | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Advanced params
  const [radius, setRadius] = useState(1.4);
  const [exhaustiveness, setExhaustiveness] = useState(20);

  useEffect(() => {
    // fetch targets from /api/redocking/targets and others
    const fetchTargets = async () => {
      try {
        const [targetsRes, resultsRes, chemblRes, zincRes, redockRes, admetRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/redocking/targets?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/api/docking/results?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/chembl_files?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/zinc_files?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/api/redocking/results?t=${Date.now()}`),
          fetch(`${API_BASE_URL}/api/admet/results?t=${Date.now()}`)
        ]);
        
        if (targetsRes.ok) {
          const targets = await targetsRes.json();
          setPdbTargets(targets);
          if (targets.length > 0) setSelectedTarget(targets[0]);
        }
        
        if (redockRes.ok) {
          const redockTargets = await redockRes.json();
          setTargetsWithRedocking(redockTargets);
        }
        
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          setAvailableResults(results);
          if (results.length > 0 && !activeResultTarget) {
            setActiveResultTarget(results[0]);
          }
        }
        
        if (admetRes.ok) {
          const admetTargets = await admetRes.json();
          setTargetsWithAdmet(admetTargets);
        }

        if (chemblRes.ok) {
          const chemblData = await chemblRes.json();
          // Fix: chemblData is an object mapping target names to info, so we need the keys to check inclusion later
          setChemblTargets(Object.keys(chemblData));
        }

        if (zincRes.ok) {
          const zincData = await zincRes.json();
          setZincTargets(zincData);
        }
      } catch (err) {
        console.error("Failed to fetch docking data", err);
      }
    };
    fetchTargets();
  }, []);

  useEffect(() => {
    if (selectedTarget) {
      if (targetsWithRedocking.includes(selectedTarget)) {
        // Fetch ligands from redocking results
        const fetchLigands = async () => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/redocking/csv/${selectedTarget}`, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (data.headers && data.rows) {
                const pdbIdx = data.headers.findIndex((h: string) => h.toUpperCase() === 'PDB_CODE');
                const ligIdx = data.headers.findIndex((h: string) => h.toUpperCase() === 'LIGAND');
                const resIdx = data.headers.findIndex((h: string) => h.toUpperCase() === 'RESNUM');
                const chainIdx = data.headers.findIndex((h: string) => h.toUpperCase() === 'CHAIN');
                const rmsdIdx = data.headers.findIndex((h: string) => h.toUpperCase() === 'RMSD');

                const parsedLigands = data.rows.map((row: any) => ({
                  pdb_id: row[pdbIdx],
                  resname: row[ligIdx],
                  resnum: row[resIdx],
                  chain: row[chainIdx],
                  rmsd: row[rmsdIdx] !== null && row[rmsdIdx] !== undefined ? parseFloat(row[rmsdIdx]).toFixed(2) : 'N/A'
                }));
                
                setAvailableLigands(parsedLigands);
                if (parsedLigands.length > 0) {
                  setSelectedLigand(parsedLigands[0]);
                } else {
                  setSelectedLigand(null);
                }
              } else {
                setAvailableLigands([]);
                setSelectedLigand(null);
              }
            } else {
              setAvailableLigands([]);
              setSelectedLigand(null);
            }
          } catch(e) {
            console.error(e);
            setAvailableLigands([]);
            setSelectedLigand(null);
          }
        }
        fetchLigands();
      } else {
        // Redocking not run
        setAvailableLigands([]);
        setSelectedLigand(null);
      }
    }
  }, [selectedTarget, targetsWithRedocking]);

  // Results fetch effect
  useEffect(() => {
    if (activeResultTarget) {
      const fetchResultCsv = async () => {
        setLoadingResults(true);
        try {
          const res = await fetch(`${API_BASE_URL}/api/docking/csv/${activeResultTarget}`);
          if (res.ok) {
            const data = await res.json();
            setResultsData({ headers: data.headers, rows: data.rows });
          }
        } catch (err) {
          console.error("Failed to fetch result CSV", err);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResultCsv();
    }
  }, [activeResultTarget]);

  // Polling for task status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (runningTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/docking/status/${runningTaskId}`);
          if (res.ok) {
            const data = await res.json();
            setTaskStatus(data);
            setExecutionLogs(data.logs || "");
            
            if (data.status === 'completed' || data.status === 'error') {
              setRunningTaskId(null);
              onTaskEnd();
              const resultsRes = await fetch(`${API_BASE_URL}/api/docking/results?t=${Date.now()}`);
              if (resultsRes.ok) {
                const results = await resultsRes.json();
                setAvailableResults(results);
                if (data.status === 'completed') setActiveResultTarget(selectedTarget);
              }
            }
          }
        } catch (err) {
          console.error("Error polling status", err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [runningTaskId]);

  const runDocking = async () => {
    if (!selectedTarget || !selectedLigand) return;
    try {
      setExecutionLogs("");
      setTaskStatus({ status: 'starting', message: 'Initializing task...' });
      const res = await fetch(`${API_BASE_URL}/api/docking/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target: selectedTarget, 
          pdb_code: selectedLigand,
          library,
          charge_type: chargeType, 
          prepare_complex: prepareComplex,
          radius,
          exhaustiveness
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setRunningTaskId(data.task_id);
        onTaskStart(data.task_id);
      } else {
        const error = await res.json();
        setTaskStatus({ status: 'error', message: error.message });
      }
    } catch (err) {
      setTaskStatus({ status: 'error', message: "Failed to start docking task." });
    }
  };

  const downloadCsv = () => {
    if (activeResultTarget) {
      window.open(`${API_BASE_URL}/api/docking/download/${activeResultTarget}`, '_blank');
    }
  };

  return (
    <div style={{ marginTop: '20px' }}>
      {pdbTargets.length === 0 && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! No PDB targets available.</strong>
            <span>You must first download at least one target on the </span>
            <Link href="/pdb" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
              PDB Search page
            </Link>
            <span> before you can perform a docking simulation.</span>
          </div>
        </div>
      )}

      {!targetsWithRedocking.includes(selectedTarget) && selectedTarget && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! Redocking Required.</strong>
            <span>You must run the redocking simulation first for target <b>{selectedTarget}</b> on the Redocking tab.</span>
          </div>
        </div>
      )}

      {!targetsWithAdmet.includes(selectedTarget) && selectedTarget && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! ADMET Filter Required.</strong>
            <span>You must run the ADMET analysis first for target <b>{selectedTarget}</b> to filter ligands. Do this on the ADMET Filter tab before you can perform a docking simulation.</span>
          </div>
        </div>
      )}

      {selectedTarget && library === 'chembl' && !chemblTargets.includes(selectedTarget) && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! Missing ChEMBL Target.</strong>
            <span>You selected {selectedTarget}, but no ligands were found in the ChEMBL database for it. You must download it on the </span>
            <Link href="/chembl" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
              ChEMBL Search page
            </Link>
            <span> before running docking with this library.</span>
          </div>
        </div>
      )}

      {selectedTarget && library === 'zinc' && !zincTargets.includes(selectedTarget) && (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '20px', 
          borderRadius: '10px', 
          marginBottom: '30px',
          border: '1px solid #ffeeba',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>Attention! Missing ZINC Target.</strong>
            <span>You selected {selectedTarget}, but no ligands were found in the ZINC database for it. You must download it on the </span>
            <Link href="/zinc" style={{ fontWeight: 'bold', textDecoration: 'underline', color: '#856404' }}>
              ZINC Search page
            </Link>
            <span> before running docking with this library.</span>
          </div>
        </div>
      )}
      <div style={{ 
        backgroundColor: '#fff', 
        padding: '25px', 
        borderRadius: '12px', 
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
        border: '1px solid #eee',
        marginBottom: '30px'
      }}>
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '20px' }}>Virtual Screening / Docking Parameters</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Target:</label>
            <select 
              value={selectedTarget} 
              onChange={(e) => setSelectedTarget(e.target.value)} 
              disabled={isTaskRunning}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              {pdbTargets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Binding Site (Ligand):</label>
            <select 
              value={selectedLigand ? JSON.stringify(selectedLigand) : ""} 
              onChange={(e) => setSelectedLigand(JSON.parse(e.target.value))} 
              disabled={isTaskRunning || availableLigands.length === 0}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              {availableLigands.length === 0 && <option value="">No ligands found</option>}
              {availableLigands.map(l => (
                <option key={JSON.stringify(l)} value={JSON.stringify(l)}>{`${l.pdb_id} - ${l.resname} (Chain: ${l.chain}, Num: ${l.resnum}) - RMSD: ${l.rmsd}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Library:</label>
            <select 
              value={library} 
              onChange={(e) => setLibrary(e.target.value)} 
              disabled={isTaskRunning}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="chembl">ChEMBL (DrugBank)</option>
              <option value="zinc">ZINC</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Charge Type:</label>
            <select 
              value={chargeType} 
              onChange={(e) => setChargeType(e.target.value)}
              disabled={isTaskRunning}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="am1">AM1 (Recommended)</option>
              <option value="gas">Gasteiger</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input 
              type="checkbox" 
              id="prepCompDock" 
              checked={prepareComplex} 
              onChange={(e) => setPrepareComplex(e.target.checked)}
              disabled={isTaskRunning}
              style={{ width: '18px', height: '18px', marginRight: '10px' }}
            />
            <label htmlFor="prepCompDock" style={{ fontWeight: 'bold', cursor: 'pointer' }}>Prepare Complex (Missing Hydrogens, Charges)</label>
          </div>
        </div>

        <button 
          onClick={runDocking} 
          disabled={isTaskRunning || !selectedTarget || !selectedLigand || !targetsWithRedocking.includes(selectedTarget) || !targetsWithAdmet.includes(selectedTarget) || (library === 'chembl' && !chemblTargets.includes(selectedTarget)) || (library === 'zinc' && !zincTargets.includes(selectedTarget))}
          style={{ 
            padding: '12px 30px', 
            backgroundColor: 'var(--primary-color)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: (isTaskRunning || !selectedTarget || !selectedLigand || !targetsWithRedocking.includes(selectedTarget) || !targetsWithAdmet.includes(selectedTarget) || (library === 'chembl' && !chemblTargets.includes(selectedTarget)) || (library === 'zinc' && !zincTargets.includes(selectedTarget))) ? 0.6 : 1,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          {isTaskRunning ? 'Running...' : 'Run Virtual Screening (Consensus)'}
        </button>
      </div>

      {taskStatus?.status === 'error' && (
        <div className="error" style={{ marginBottom: '30px' }}>
          <strong>Error:</strong> {taskStatus.message}
        </div>
      )}

      {/* RESULTS SECTION */}
      {availableResults.length > 0 && (
        <div style={{ marginTop: '50px' }}>
          <h3 style={{ color: 'var(--primary-color)', marginBottom: '20px' }}>Docking Results</h3>
          
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '25px', gap: '5px', overflowX: 'auto' }}>
            {availableResults.map(target => (
              <button 
                key={target}
                onClick={() => setActiveResultTarget(target)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: activeResultTarget === target ? '#f3f0ff' : 'transparent',
                  color: activeResultTarget === target ? '#6b46c1' : '#666',
                  border: 'none',
                  borderBottom: activeResultTarget === target ? '3px solid #6b46c1' : '3px solid transparent',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                {target}
              </button>
            ))}
          </div>

          {activeResultTarget && (
            <div style={{ 
              backgroundColor: '#fff', 
              padding: '25px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
              border: '1px solid #eee'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h4 style={{ margin: 0, color: '#333' }}>Target: {activeResultTarget}</h4>
                <button 
                  onClick={downloadCsv}
                  style={{ 
                    padding: '10px 25px', 
                    backgroundColor: '#6b46c1', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 2px 4px rgba(107, 70, 193, 0.3)'
                  }}
                >
                  <i className="fas fa-download"></i> Download CSV
                </button>
              </div>

              {/* RESULTS TABLE (First) */}
              {loadingResults ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading result table...</p>
              ) : resultsData ? (
                <div style={{ marginBottom: '40px', position: 'relative' }}>
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', maxHeight: isTableExpanded ? 'none' : '400px', overflowY: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                          {resultsData.headers.map((h, idx) => {
                            let displayHeader = h;
                            if (h === 'vina') displayHeader = 'vina (kcal/mol)';
                            else if (h === 'dock6') displayHeader = 'dock6 (Grid Score)';
                            
                            return (
                              <th key={idx} style={{ padding: '14px 16px', textAlign: 'left', color: '#374151', fontWeight: 600, fontSize: '0.95rem' }}>
                                {displayHeader}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {resultsData.rows.slice(0, isTableExpanded ? resultsData.rows.length : 5).map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            {row.map((cell: any, j: number) => <td key={j} style={{ padding: '12px 16px', color: '#4b5563', fontSize: '0.9rem' }}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {!isTableExpanded && resultsData.rows.length > 5 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px',
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1) 80%)',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '10px'
                    }}>
                      <button onClick={() => setIsTableExpanded(true)} style={{ padding: '8px 16px', backgroundColor: '#fff', color: 'var(--primary-color)', border: '2px solid var(--primary-color)', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
                        <i className="fas fa-chevron-down"></i> Show more ({resultsData.rows.length - 5} remaining)
                      </button>
                    </div>
                  )}
                  {isTableExpanded && resultsData.rows.length > 5 && (
                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                      <button onClick={() => setIsTableExpanded(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>Show less</button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No result data available for this target.</p>
              )}

              {/* Correlation Plot section removed */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN ANALYSIS PAGE
// ==========================================

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<"similarity" | "docking" | "redocking" | "admet">("similarity");
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [executionLogs, setExecutionLogs] = useState("");

  const handleTaskStart = (id: string) => {
    setIsTaskRunning(true);
    setLoadingMessage(
      activeTab === 'admet'
        ? 'ADMET analysis is running in background...'
        : activeTab === 'docking' 
          ? 'Virtual Screening (Docking) is running in background...'
          : 'Redocking simulation is running in background...'
    );
  };

  const handleTaskEnd = () => {
    setIsTaskRunning(false);
  };

  return (
    <>
      <Head>
        <title>Analysis | BioMolExplorer</title>
      </Head>

      <main className="container" style={{ maxWidth: '1400px', marginBottom: '40px' }}>
        <h2 className="page-title" style={{ marginBottom: "20px", fontSize: "2.5rem" }}>
          Target-Ligand Analysis
        </h2>

        {/* TAB NAVIGATION */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '2px solid #ddd', 
          marginBottom: '20px',
          gap: '10px'
        }}>
          <button 
            onClick={() => setActiveTab("similarity")}
            style={{
              padding: '12px 25px',
              backgroundColor: activeTab === "similarity" ? 'var(--primary-color)' : 'transparent',
              color: activeTab === "similarity" ? 'white' : '#333',
              border: 'none',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            <i className="fas fa-network-wired" style={{ marginRight: '8px' }}></i>
            Molecular Similarity
          </button>
          <button
            onClick={() => setActiveTab("docking")}
            style={{
              padding: '12px 25px',
              backgroundColor: activeTab === "docking" ? 'var(--primary-color)' : 'transparent',
              color: activeTab === "docking" ? 'white' : '#333',
              border: 'none',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            <i className="fas fa-layer-group" style={{ marginRight: '8px' }}></i>
            Docking (Virtual Screening)
          </button>
          <button
            onClick={() => setActiveTab("redocking")}
            style={{
              padding: '12px 25px',
              backgroundColor: activeTab === "redocking" ? 'var(--primary-color)' : 'transparent',
              color: activeTab === "redocking" ? 'white' : '#333',
              border: 'none',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            <i className="fas fa-microscope" style={{ marginRight: '8px' }}></i>
            Redocking (AutoDock Vina)
          </button>
          <button
            onClick={() => setActiveTab("admet")}
            style={{
              padding: '12px 25px',
              backgroundColor: activeTab === "admet" ? 'var(--primary-color)' : 'transparent',
              color: activeTab === "admet" ? 'white' : '#333',
              border: 'none',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            <i className="fas fa-flask" style={{ marginRight: '8px' }}></i>
            ADMET Analysis
          </button>
        </div>

        {activeTab === "similarity" && <SimilarityTab />}
        {activeTab === "docking" && (
          <DockingTab 
            onTaskStart={handleTaskStart} 
            onTaskEnd={handleTaskEnd} 
            executionLogs={executionLogs}
            setExecutionLogs={setExecutionLogs}
            isTaskRunning={isTaskRunning}
          />
        )}
        {activeTab === "redocking" && (
          <RedockingTab 
            onTaskStart={handleTaskStart} 
            onTaskEnd={handleTaskEnd} 
            executionLogs={executionLogs}
            setExecutionLogs={setExecutionLogs}
            isTaskRunning={isTaskRunning}
          />
        )}
        {activeTab === "admet" && (
          <AdmetTab
            onTaskStart={handleTaskStart}
            onTaskEnd={handleTaskEnd}
            executionLogs={executionLogs}
            setExecutionLogs={setExecutionLogs}
            isTaskRunning={isTaskRunning}
          />
        )}
      </main>

      {/* Subtle loading indicator instead of a full lock */}
      {isTaskRunning && (
        <LoadingOverlay isLoading={isTaskRunning} message={loadingMessage}>
          <Terminal logs={executionLogs} />
        </LoadingOverlay>
      )}
    </>
  );
}
