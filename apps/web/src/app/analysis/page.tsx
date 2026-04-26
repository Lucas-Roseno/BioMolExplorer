"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";
import dynamic from 'next/dynamic';
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

export default function SimilarityAnalysis() {
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
  // ==========================================
  // LOAD API DATA
  // ==========================================
  // Fetch available targets once
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
      if (!selectedTarget) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        // Fetch Graph Data
        const graphRes = await fetch(`${API_BASE_URL}/api/analysis/graph-data?target=${encodeURIComponent(selectedTarget)}&datasetType=${datasetType}`);
        if (!graphRes.ok) throw new Error("Failed to load graph data.");

        const graphJson = await graphRes.json();

        if (graphJson.success && graphJson.data) {
          // Calculate node degree (val)
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

          // Calculate Interactive Charts Data
          const degreeArray = Object.values(nodeDegree).sort((a,b) => b - a);
          const rData = degreeArray.map((val, index) => ({ rank: index + 1, degree: val }));

          const degreeCounts: Record<number, number> = {};
          degreeArray.forEach(val => {
             degreeCounts[val] = (degreeCounts[val] || 0) + 1;
          });
          const hData = Object.keys(degreeCounts)
            .map(Number)
            .sort((a,b) => a - b)
            .map(deg => ({ degree: deg, count: degreeCounts[deg] }));

          setRankData(rData);
          setHistogramData(hData);
          setFullGraphDegrees(graphJson.data.fullGraphDegrees || []);
          
          setGraphData(graphJson.data);
        }

        // Fetch Plot Gallery
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
  }, [selectedTarget, datasetType]);

  // ==========================================
  // GRAPH EVENTS
  // ==========================================
  const handleNodeClick = useCallback(
    async (node: GraphNode) => {
      setSelectedNode(node);
      setIsModalOpen(true);
      setMoleculeSvg(null);

      // Center and Zoom
      if (graphRef.current) {
        if (is3D) {
          // 3D Camera movement: move camera to look at node from a distance
          const distance = 40;
          const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, (node as any).z || 0);

          graphRef.current.cameraPosition(
            { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: ((node as any).z || 0) * distRatio }, // new position
            { x: node.x || 0, y: node.y || 0, z: (node as any).z || 0 }, // lookAt
            2000  // transition duration
          );
        } else {
          // 2D Centering
          graphRef.current.centerAt(node.x, node.y, 1000);
          graphRef.current.zoom(8, 2000);
        }
      }

      // Fetch SVG from backend
      if (node.smiles) {
        setSvgLoading(true);
        try {
          const res = await fetch(`${API_BASE_URL}/api/analysis/molecule-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smiles: node.smiles })
          });
          const data = await res.json();
          if (data.success && data.svg) {
            setMoleculeSvg(data.svg);
          } else {
            console.error(data.message);
          }
        } catch (err) {
          console.error("Failed to load SVG", err);
        } finally {
          setSvgLoading(false);
        }
      }
    },
    [is3D]
  );

  // Automatically center graph when physics simulation ends or view changes
  const handleEngineStop = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(800, 40);
    }
  }, []);

  useEffect(() => {
    if (!loading && graphData && graphRef.current) {
      // Fallback: force center after 2s in case onEngineStop doesn't fire
      const t = setTimeout(() => {
        if (graphRef.current) graphRef.current.zoomToFit(800, 40);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [loading, graphData, is3D]);

  const targetNorm = selectedTarget.replace(/\s+/g, '').toLowerCase();
  const summaryImageUrl = plots.find((plotStr: string) => 
    plotStr.replace(/\s+/g, '').toLowerCase().includes(targetNorm) && 
    plotStr.includes('Tanimoto_morgan') &&
    plotStr.includes(datasetType)
  );

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <>
      <Head>
        <title>Similarity Analysis | BioMolExplorer</title>
      </Head>

      <main className="container" style={{ maxWidth: '1400px', marginBottom: '40px' }}>
        <h2 className="page-title" style={{ marginBottom: "10px", fontSize: "2.5rem" }}>
          Molecular Similarity Network
        </h2>

        {targets.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Select Target:</label>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '5px',
                  border: '1px solid #ccc',
                  fontSize: '1rem'
                }}
              >
                {targets.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Dataset Type:</label>
              <select
                value={datasetType}
                onChange={(e) => setDatasetType(e.target.value as 'MOLS' | 'SIMS')}
                style={{
                  padding: '8px',
                  borderRadius: '5px',
                  border: '1px solid #ccc',
                  fontSize: '1rem'
                }}
              >
                <option value="MOLS">Molecular Data (MOLS)</option>
                <option value="SIMS">Similar Molecules (SIMS)</option>
              </select>
            </div>
            
            {summaryImageUrl && (
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                <a
                  href={`${API_BASE_URL}/api/analysis/plot/${summaryImageUrl}`}
                  target="_blank"
                  download
                  style={{
                    padding: '8px 15px',
                    backgroundColor: 'var(--primary-color)',
                    color: '#fff',
                    borderRadius: '5px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                  </svg>
                  Download Summary ({datasetType})
                </a>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", marginBottom: "30px", color: "#666" }}>
          <p style={{ marginBottom: "10px" }}>
            Explore connections between molecules based on Tanimoto Similarity (Morgan Fingerprints).
            <br /><strong>Tip:</strong> Click a node to view its 2D structure. Drag to pan or use scroll to zoom.
          </p>
          <button
            onClick={() => setIs3D(!is3D)}
            style={{
              padding: '8px 16px',
              backgroundColor: is3D ? '#26828e' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
          >
            {is3D ? 'Switch to 2D View' : 'Switch to 3D View'}
          </button>
        </div>

        {loading && <p style={{ textAlign: 'center', margin: '40px 0', fontSize: '1.2rem', color: 'var(--primary-color)' }}>Loading similarity graph...</p>}
        {errorMsg && <div id="response" className="error" style={{ maxWidth: "100%" }}>{errorMsg}</div>}

        {/* GRAPH CONTAINER */}
        {!loading && graphData && (
          <div
            ref={containerRef}
            style={{
              height: '600px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#fff',
              position: 'relative',
              boxShadow: '0 4px 15px var(--shadow-color)'
            }}
          >
            {is3D ? (
              <ForceGraph3D
                ref={graphRef}
                graphData={graphData}
                width={containerSize.width}
                height={containerSize.height}
                nodeLabel="id"
                nodeColor={(node) => getViridisColor((node as GraphNode).val, minDegree, maxDegree)}
                nodeRelSize={4}
                backgroundColor="#ffffff"
                linkColor={() => "rgba(100, 100, 100, 0.6)"}
                linkWidth={(link) => (link.value * 2)}
                onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)}
                enableNodeDrag={true}
                cooldownTicks={150}
                onEngineStop={handleEngineStop}
              />
            ) : (
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                width={containerSize.width}
                height={containerSize.height}
                nodeLabel="id"
                nodeColor={(node) => getViridisColor((node as GraphNode).val, minDegree, maxDegree)}
                nodeRelSize={4}
                linkColor={() => "rgba(150, 134, 222, 0.2)"}
                linkWidth={(link) => (link.value * 3)}
                onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                cooldownTicks={150}
                onEngineStop={handleEngineStop}
              />
            )}

            {/* FLOATING LEGEND */}
            <div style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '10px 15px',
              borderRadius: '5px',
              border: '1px solid #ddd',
              fontSize: '0.85rem'
            }}>
              <b>Legend:</b><br />
              <span style={{ color: '#26828e' }}>●</span> Node: Molecule (ChEMBL ID)<br />
              ━ Edge: Similarity<br />
            </div>

            {/* COLOR SCALE / COLORBAR */}
            <div style={{
              position: 'absolute',
              right: 20,
              bottom: 20,
              top: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', height: '80%', alignItems: 'center' }}>
                <div style={{
                  height: '100%',
                  width: '20px',
                  background: 'linear-gradient(to top, #440154, #482878, #3e4989, #31688e, #26828e, #1f9e89, #35b779, #6ece58, #b5de2b, #fde725)',
                  borderRadius: '10px',
                  border: '1px solid #ccc',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }}></div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                  marginLeft: '10px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  color: '#333'
                }}>
                  <span>{maxDegree}</span>
                  <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', flex: 1, margin: 'auto 0' }}>
                    Node Degree
                  </span>
                  <span>{minDegree}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INTERACTIVE NETWORK CHARTS */}
        {!loading && rankData.length > 0 && (
          <div style={{ marginTop: '50px' }}>
            <h3 style={{ color: 'var(--primary-color)', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              Interactive Network Analysis
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px'
            }}>
              {/* Degree Rank Plot */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Rank Plot</h4>
                 <div style={{ width: '100%', height: 300 }}>
                   <ResponsiveContainer>
                     <LineChart data={rankData} margin={{ top: 20, right: 30, left: 35, bottom: 20 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} />
                       <XAxis dataKey="rank" label={{ value: 'Rank', position: 'insideBottom', offset: -10 }} />
                       <YAxis label={{ value: 'Degree', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
                       <Tooltip />
                       <Line type="stepAfter" dataKey="degree" stroke="#5c6bc0" strokeWidth={2} dot={false} />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>

              {/* Degree Histogram */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Histogram</h4>
                 <div style={{ width: '100%', height: 300 }}>
                   <ResponsiveContainer>
                     <BarChart data={histogramData} margin={{ top: 20, right: 30, left: 35, bottom: 20 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} />
                       <XAxis dataKey="degree" label={{ value: 'Degree', position: 'insideBottom', offset: -10 }} />
                       <YAxis label={{ value: 'Number of Nodes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
                       <Tooltip cursor={{fill: 'transparent'}} />
                       <Bar dataKey="count" fill="#7986CB" />
                     </BarChart>
                   </ResponsiveContainer>
                 </div>
              </div>
              
              {/* Degree Distribution Scatter */}
              <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                 {(() => {
                   const allDistDegrees = [...histogramData.map(d => d.degree), ...fullGraphDegrees.map(d => d.degree)];
                   const maxDistDegree = allDistDegrees.length > 0 ? Math.max(...allDistDegrees) : maxDegree;
                   const xTicks = Array.from({ length: maxDistDegree + 1 }, (_, i) => i);
                   
                   return (
                     <>
                       <h4 style={{ fontSize: '1rem', color: '#555', marginBottom: '15px' }}>Degree Distribution</h4>
                       <div style={{ width: '100%', height: 300 }}>
                         <ResponsiveContainer>
                           <ScatterChart margin={{ top: 20, right: 30, left: 35, bottom: 20 }}>
                             <CartesianGrid strokeDasharray="3 3" />
                             <XAxis type="number" dataKey="degree" name="Degree" label={{ value: 'Degree', position: 'insideBottom', offset: -10 }} ticks={xTicks} domain={[0, maxDistDegree]} />
                             <YAxis type="number" dataKey="count" name="Nodes" label={{ value: 'Number of Nodes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
                             <Tooltip cursor={{strokeDasharray: '3 3'}} />
                             <Legend verticalAlign="top" height={36} />
                             {fullGraphDegrees.length > 0 && (
                               <Scatter name="Graph Degree" data={fullGraphDegrees} fill="gray" shape="circle" />
                             )}
                             <Scatter name="MaxComp Degree" data={histogramData} fill="#7995c4" shape="circle" />
                           </ScatterChart>
                         </ResponsiveContainer>
                       </div>
                     </>
                   );
                 })()}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 2D MOLECULE MODAL */}
      {isModalOpen && selectedNode && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <span className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</span>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '15px', fontSize: '1.5rem', wordBreak: 'break-all' }}>
                {selectedNode.id}
              </h3>

              <div style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '20px',
                backgroundColor: '#fafafa',
                minHeight: '250px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {selectedNode.smiles ? (
                  svgLoading ? (
                    <p>Loading SVG image...</p>
                  ) : moleculeSvg ? (
                    <div dangerouslySetInnerHTML={{ __html: moleculeSvg }} />
                  ) : (
                    <p style={{ color: 'red' }}>Failed to generate image.</p>
                  )
                ) : (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>Structure (SMILES) not found in the dataset (Missing or synthetic ID).</p>
                )}
              </div>

              <div style={{ marginTop: '20px', textAlign: 'left', backgroundColor: '#f2f4f8', padding: '15px', borderRadius: '5px' }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>SMILES:</p>
                <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {selectedNode.smiles || "N/A"}
                </p>
                <p style={{ margin: '10px 0 0 0', fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>Node connections (Degree):</p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  {selectedNode.val} strong similarity link(s)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  marginTop: '25px',
                  padding: '10px 30px',
                  backgroundColor: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
