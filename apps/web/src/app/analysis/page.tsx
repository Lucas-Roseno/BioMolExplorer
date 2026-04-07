"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";
import dynamic from 'next/dynamic';
import { API_BASE_URL } from "../../config";
import LoadingOverlay from "../../components/LoadingOverlay";

// Import dynamically to avoid SSR error ("window is not defined")
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

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
function getViridisColor(val: number, maxVal: number) {
  const t = Math.max(0, Math.min(1, val / maxVal));
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
  const [plots, setPlots] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [is3D, setIs3D] = useState<boolean>(true);

  // Modal State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [moleculeSvg, setMoleculeSvg] = useState<string | null>(null);
  const [svgLoading, setSvgLoading] = useState<boolean>(false);

  // References
  const graphRef = useRef<any>(null);

  // ==========================================
  // LOAD API DATA
  // ==========================================
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch Graph Data
        const graphRes = await fetch(`${API_BASE_URL}/api/analysis/graph-data`);
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
          graphJson.data.nodes.forEach((node: GraphNode) => {
            node.val = nodeDegree[node.id] || 1;
            if (node.val > currentMaxDegree) {
              currentMaxDegree = node.val;
            }
          });
          
          setMaxDegree(currentMaxDegree);
          setGraphData(graphJson.data);
        }

        // Fetch Plot Gallery
        const plotsRes = await fetch(`${API_BASE_URL}/api/analysis/plots`);
        if (plotsRes.ok) {
          const plotsJson = await plotsRes.json();
          if (plotsJson.success && plotsJson.data) {
            setPlots(plotsJson.data);
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
  }, []);

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

  // Automatically center graph on load or view change
  useEffect(() => {
    if (!loading && graphData && graphRef.current) {
      setTimeout(() => {
        graphRef.current.zoomToFit(800);
      }, 500);
    }
  }, [loading, graphData, is3D]);

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
                nodeLabel="id"
                nodeColor={(node) => getViridisColor((node as GraphNode).val, maxDegree)}
                nodeRelSize={4} 
                backgroundColor="#ffffff"
                linkColor={() => "rgba(100, 100, 100, 0.6)"}
                linkWidth={(link) => (link.value * 2)} 
                onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)}
                enableNodeDrag={true}
              />
            ) : (
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                nodeLabel="id"
                nodeColor={(node) => getViridisColor((node as GraphNode).val, maxDegree)}
                nodeRelSize={4} 
                linkColor={() => "rgba(150, 134, 222, 0.2)"} // Lighter color to distinguish from nodes
                linkWidth={(link) => (link.value * 3)} 
                onNodeClick={(node) => handleNodeClick(node as unknown as GraphNode)}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                cooldownTicks={100}
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
              <b>Legend:</b><br/>
              <span style={{color: '#26828e'}}>●</span> Node: Molecule (ChEMBL ID)<br/>
              ━ Edge: Similarity<br/>
              <small><i>Degree-based coloring (Viridis)</i></small>
            </div>
          </div>
        )}

        {/* PLOTS DASHBOARD */}
        {!loading && plots.length > 0 && (
          <div style={{ marginTop: '50px' }}>
            <h3 style={{ color: 'var(--primary-color)', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              Static Plots & Distributions
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', 
              gap: '20px' 
            }}>
              {plots.map((plotName) => (
                <div key={plotName} style={{ 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '15px',
                  backgroundColor: '#fff',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                  textAlign: 'center'
                }}>
                  <h4 style={{ fontSize: '1rem', color: '#555', wordBreak: 'break-all', marginBottom: '15px' }}>
                    {plotName.replace('.png', '')}
                  </h4>
                  <img 
                    src={`${API_BASE_URL}/api/analysis/plot/${plotName}`} 
                    alt={plotName} 
                    style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
                    loading="lazy"
                  />
                  <a 
                    href={`${API_BASE_URL}/api/analysis/plot/${plotName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: '15px', color: 'var(--primary-hover-color)', textDecoration: 'none', fontWeight: 'bold' }}
                  >
                    Open Image in New Tab ↗
                  </a>
                </div>
              ))}
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
