/**
 * GraphPanel.tsx
 *
 * Developer-facing panel displaying Graphify dependency graph output and mapping
 * communities to their planning docs. Invisible in production.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    RefreshCw, 
    AlertTriangle, 
    CheckCircle2, 
    HelpCircle, 
    GitCommit, 
    FileText, 
    ChevronDown, 
    ChevronUp,
    Network
} from 'lucide-react';
import { 
    communityPlanningMapping, 
    parseSuggestedQuestions, 
    parseCommunities, 
    parseBuiltFromCommit
} from './graphPlanningMapping';

interface NodeData {
    label: string;
    file_type: string;
    source_file: string;
    id: string;
    community: number;
}

interface LinkData {
    relation: string;
    confidence: string;
    source: string;
    target: string;
    weight: number;
}

interface GraphData {
    nodes: NodeData[];
    links: LinkData[];
    built_at_commit?: string;
}

interface GodNode extends NodeData {
    edgeCount: number;
}

interface ConnectedCommunity {
    communityId: string;
    communityName: string;
    connectionCount: number;
    relations: string[];
}

export const GraphPanel: React.FC = () => {
    // Return null immediately in production (Req 10.1 dev gating)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [reportMarkdown, setReportMarkdown] = useState<string>('');
    
    // UI Expand states
    const [selectedGodNode, setSelectedGodNode] = useState<GodNode | null>(null);
    const [expandedCommunity, setExpandedCommunity] = useState<string | null>(null);
    const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

    // Load data from filesystem
    const loadGraphData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch graph.json and GRAPH_REPORT.md
            const [graphRes, reportRes] = await Promise.all([
                fetch('/graphify-out/graph.json'),
                fetch('/graphify-out/GRAPH_REPORT.md')
            ]);

            if (!graphRes.ok || !reportRes.ok) {
                throw new Error('Absent');
            }

            const graphJson = await graphRes.json();
            const reportText = await reportRes.text();

            if (!graphJson.nodes || !graphJson.links) {
                throw new Error('Malformed');
            }

            setGraphData(graphJson);
            setReportMarkdown(reportText);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setError(
                errMsg === 'Absent' || errMsg === 'Malformed'
                    ? 'Graphify files are missing or malformed.'
                    : `Failed to load graph data: ${errMsg}`
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGraphData();
    }, [loadGraphData]);

    // Return null immediately in production (Req 10.1 dev gating)
    if (!import.meta.env.DEV) {
        return null;
    }

    if (loading) {
        return (
            <div className="cine-graph-panel-loading">
                <RefreshCw size={20} className="cine-spinner" />
                <span>Loading codebase graph data...</span>
            </div>
        );
    }

    if (error || !graphData) {
        return (
            <div className="cine-graph-panel-error" role="alert">
                <AlertTriangle size={24} className="cine-error-icon" />
                <div className="cine-error-content">
                    <h5 className="cine-error-title">Graphify Data Missing</h5>
                    <p className="cine-error-msg">
                        The codebase graph metadata is not available. Run <code>graphify update .</code> in the root directory to generate the required dependency graph.
                    </p>
                    <button 
                        type="button" 
                        className="cine-btn cine-btn--secondary cine-btn--sm cine-mt-2"
                        onClick={loadGraphData}
                    >
                        <RefreshCw size={12} />
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    // Process graph statistics & connections
    const { nodes, links } = graphData;
    const parsedCommunities = parseCommunities(reportMarkdown);
    const suggestedQuestions = parseSuggestedQuestions(reportMarkdown);
    const reportCommit = parseBuiltFromCommit(reportMarkdown) || graphData.built_at_commit || '';
    const gitCommit = import.meta.env.VITE_GIT_COMMIT || '';

    // Calculate edge counts for God Nodes (Req 10.5)
    const edgeCounts: Record<string, number> = {};
    nodes.forEach(n => { edgeCounts[n.id] = 0; });
    links.forEach(l => {
        if (edgeCounts[l.source] !== undefined) edgeCounts[l.source]++;
        if (edgeCounts[l.target] !== undefined) edgeCounts[l.target]++;
    });

    const godNodes: GodNode[] = [...nodes]
        .map(n => ({ ...n, edgeCount: edgeCounts[n.id] || 0 }))
        .sort((a, b) => b.edgeCount - a.edgeCount)
        .slice(0, 10);

    // Get connection details for selected God Node (Req 10.6)
    const getConnectedCommunities = (node: GodNode): ConnectedCommunity[] => {
        const nodeLinks = links.filter(l => l.source === node.id || l.target === node.id);
        const communityGroups: Record<number, { count: number; relations: Set<string> }> = {};

        nodeLinks.forEach(l => {
            const otherId = l.source === node.id ? l.target : l.source;
            const otherNode = nodes.find(n => n.id === otherId);
            if (otherNode && otherNode.community !== undefined) {
                const commId = otherNode.community;
                if (!communityGroups[commId]) {
                    communityGroups[commId] = { count: 0, relations: new Set<string>() };
                }
                communityGroups[commId].count++;
                if (l.relation) communityGroups[commId].relations.add(l.relation);
            }
        });

        return Object.entries(communityGroups)
            .map(([commIdStr, data]) => {
                const commIdNum = parseInt(commIdStr, 10);
                const commInfo = parsedCommunities.find(c => c.id === `Community ${commIdNum}`);
                return {
                    communityId: `Community ${commIdNum}`,
                    communityName: commInfo ? commInfo.name : `Community ${commIdNum}`,
                    connectionCount: data.count,
                    relations: Array.from(data.relations)
                };
            })
            .sort((a, b) => b.connectionCount - a.connectionCount)
            .slice(0, 5);
    };

    // Freshness status comparison (Req 12.1-12.4)
    const isCommitUnknown = !gitCommit;
    const isStale = !isCommitUnknown && reportCommit && !gitCommit.toLowerCase().startsWith(reportCommit.toLowerCase().slice(0, 7)) && !reportCommit.toLowerCase().startsWith(gitCommit.toLowerCase().slice(0, 7));


    return (
        <motion.div 
            className="cine-graph-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
            <div className="cine-graph-header-row">
                <h4 className="cine-graph-section-title">
                    <Network size={16} /> Codebase Dependency Graph
                </h4>
                <div className="cine-graph-actions">
                    <button 
                        type="button" 
                        className="cine-btn cine-btn--ghost cine-btn--sm"
                        onClick={loadGraphData}
                        title="Re-read graphify output files"
                        aria-label="Refresh graph data"
                    >
                        <RefreshCw size={12} className="cine-refresh-icon" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Freshness Banner System */}
            <div className="cine-graph-freshness-row">
                {isCommitUnknown ? (
                    <div className="cine-freshness-badge neutral" title="VITE_GIT_COMMIT is empty or undefined">
                        <GitCommit size={12} />
                        <span>Commit unknown</span>
                    </div>
                ) : isStale ? (
                    <div className="cine-freshness-banner warning">
                        <AlertTriangle size={14} />
                        <span>Graph may be stale (built from <code>{reportCommit.slice(0, 7)}</code>, current is <code>{gitCommit.slice(0, 7)}</code>) — run <code>graphify update .</code></span>
                    </div>
                ) : (
                    <div className="cine-freshness-badge success">
                        <CheckCircle2 size={12} />
                        <span>Graph is current ({gitCommit.slice(0, 7)})</span>
                    </div>
                )}
            </div>

            {/* Core Stats Summary */}
            <div className="cine-graph-stats-grid">
                <div className="cine-graph-stat-card">
                    <span className="value">{nodes.length.toLocaleString()}</span>
                    <span className="label">Total Nodes</span>
                </div>
                <div className="cine-graph-stat-card">
                    <span className="value">{links.length.toLocaleString()}</span>
                    <span className="label">Total Edges</span>
                </div>
                <div className="cine-graph-stat-card">
                    <span className="value">{parsedCommunities.length}</span>
                    <span className="label">Abstractions</span>
                </div>
            </div>

            {/* God Nodes / Navigation Shortcuts */}
            <div className="cine-graph-subsection">
                <h5 className="cine-graph-subtitle">Abstractions Hub (Top 10 Nodes)</h5>
                <div className="cine-god-nodes-chips">
                    {godNodes.map(node => {
                        const isActive = selectedGodNode?.id === node.id;
                        return (
                            <button
                                key={node.id}
                                type="button"
                                className={`cine-god-chip ${isActive ? 'active' : ''}`}
                                onClick={() => setSelectedGodNode(isActive ? null : node)}
                                aria-expanded={isActive}
                            >
                                <span className="name">{node.label}</span>
                                <span className="count">{node.edgeCount}</span>
                            </button>
                        );
                    })}
                </div>

                <AnimatePresence>
                    {selectedGodNode && (
                        <motion.div
                            className="cine-god-node-details"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="details-header">
                                <h6>Abstractions Connection mapping: <code>{selectedGodNode.label}</code></h6>
                                <span className="file-path">{selectedGodNode.source_file}</span>
                            </div>
                            <div className="details-body">
                                <span className="sub-label">Top 5 Connected Communities:</span>
                                <ul className="connected-comm-list">
                                    {getConnectedCommunities(selectedGodNode).map(cc => (
                                        <li key={cc.communityId}>
                                            <span className="comm-name">{cc.communityName}</span>
                                            <span className="conn-count">{cc.connectionCount} edges</span>
                                            <div className="comm-relations">
                                                {cc.relations.map(rel => (
                                                    <span key={rel} className="rel-tag">{rel}</span>
                                                ))}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Communities list */}
            <div className="cine-graph-subsection">
                <h5 className="cine-graph-subtitle">Communities &amp; Abstractions</h5>
                <div className="cine-communities-list">
                    {parsedCommunities
                        .filter(c => c.nodeCount >= 3)
                        .sort((a, b) => b.cohesion - a.cohesion)
                        .map(comm => {
                            const isExpanded = expandedCommunity === comm.id;
                            const planningDocs = communityPlanningMapping[comm.id] || [];

                            return (
                                <div key={comm.id} className="cine-community-card">
                                    <button
                                        type="button"
                                        className="cine-community-header"
                                        onClick={() => setExpandedCommunity(isExpanded ? null : comm.id)}
                                        aria-expanded={isExpanded}
                                    >
                                        <div className="comm-title-meta">
                                            <span className="comm-name">{comm.name}</span>
                                            <span className="comm-meta">
                                                cohesion: <code>{comm.cohesion.toFixed(2)}</code> · {comm.nodeCount} nodes
                                            </span>
                                        </div>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                className="cine-community-body"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                {/* Mapped Planning Documents */}
                                                <div className="comm-planning-docs">
                                                    <span className="sec-title">Linked Planning Docs:</span>
                                                    {planningDocs.length > 0 ? (
                                                        <div className="docs-list">
                                                            {planningDocs.map(doc => {
                                                                const filename = doc.split('/').pop() || doc;
                                                                return (
                                                                    <a
                                                                        key={doc}
                                                                        href={`/${doc}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="cine-doc-link"
                                                                    >
                                                                        <FileText size={12} />
                                                                        {filename}
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <span className="empty-docs">No specific planning document mapped. Fallback to <a href="/.planning/PROJECT.md" target="_blank" rel="noopener noreferrer" className="cine-doc-link">PROJECT.md</a></span>
                                                    )}
                                                </div>

                                                {/* Top Nodes */}
                                                <div className="comm-nodes-preview">
                                                    <span className="sec-title">Top Nodes:</span>
                                                    <div className="nodes-chips">
                                                        {comm.nodes.slice(0, 10).map((n, idx) => (
                                                            <span key={idx} className="node-chip">{n}</span>
                                                        ))}
                                                        {comm.nodes.length > 10 && (
                                                            <span className="node-chip-more">+{comm.nodes.length - 10} more</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* Suggested Questions FAQ */}
            {suggestedQuestions.length > 0 && (
                <div className="cine-graph-subsection">
                    <h5 className="cine-graph-subtitle">Suggested Codebase Questions</h5>
                    <div className="cine-faq-accordion">
                        {suggestedQuestions.map((item, idx) => {
                            const isFaqExpanded = expandedFaq === idx;
                            return (
                                <div key={idx} className="cine-faq-item">
                                    <button
                                        type="button"
                                        className="cine-faq-trigger"
                                        onClick={() => setExpandedFaq(isFaqExpanded ? null : idx)}
                                        aria-expanded={isFaqExpanded}
                                    >
                                        <HelpCircle size={14} className="cine-faq-icon" />
                                        <span className="faq-question">{item.question}</span>
                                        {isFaqExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    <AnimatePresence>
                                        {isFaqExpanded && (
                                            <motion.div
                                                className="cine-faq-content"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                <p>{item.context}</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default GraphPanel;
