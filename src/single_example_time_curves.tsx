import React, { useEffect, useRef } from "react";
import './single_example_time_curves.css';
import { observer } from "mobx-react";
import * as d3 from "d3";
import { UMAP } from "umap-js";
import { getContextualTokenEmbeddings } from "./embed";
import { state } from "./state";

interface Props {
    promptGroups: { promptId: string, generations: string[] }[];
}

interface TokenPoint {
    token: string;
    embedding: number[];
    sentIdx: number;
    tokenIdx: number;
    promptGroupIdx: number;
    x?: number;
    y?: number;
}

interface UMAPParams {
    nNeighbors: number;
    minDist: number;
    spread: number;
}

interface TimeCurvesState {
    isLoading: boolean;
    loadingMessage: string;
    error: string | null;
    umapParams: UMAPParams;
    showMultiples: boolean;
    multiplesResults: { minDist: number; spread: number; points: TokenPoint[] }[] | null;
    interpolationFraction: number; // 0 = 1D timeline, 1 = full UMAP projection
}

const MARGIN = { top: 40, right: 40, bottom: 40, left: 40 };
const DOT_RADIUS = 4;
const FONT_SIZE = 11;

/** Reasonable minDist × spread combos for small multiples (4×4 grid) */
const MULTIPLES_PARAMS: { minDist: number; spread: number }[] = [
    { minDist: 0.1, spread: 1.0 }, { minDist: 0.2, spread: 1.0 }, { minDist: 0.3, spread: 1.0 }, { minDist: 0.4, spread: 1.0 },
    { minDist: 0.1, spread: 1.4 }, { minDist: 0.2, spread: 1.4 }, { minDist: 0.3, spread: 1.4 }, { minDist: 0.4, spread: 1.4 },
    { minDist: 0.1, spread: 1.8 }, { minDist: 0.2, spread: 1.8 }, { minDist: 0.3, spread: 1.8 }, { minDist: 0.4, spread: 1.8 },
    { minDist: 0.1, spread: 2.2 }, { minDist: 0.2, spread: 2.2 }, { minDist: 0.3, spread: 2.2 }, { minDist: 0.4, spread: 2.2 },
];

/**
 * Catmull-Rom to Bézier control points per Bach et al. 2015 Time Curves, Sec 6.4.
 * Tangent at p_i = (p_{i+1} - p_{i-1})/2; Bézier controls = p_i ± tangent/3.
 * Displacement is 1/6 of chord—standard uniform Catmull-Rom.
 */
function computeControlPoints(
    points: { x: number; y: number }[]
): { cSucc: [number, number][]; cPrev: [number, number][] } {
    const cSucc: [number, number][] = [];
    const cPrev: [number, number][] = [];
    const n = points.length;
    if (n < 2) return { cSucc, cPrev };
    for (let i = 0; i < n - 1; i++) {
        const pPrev = points[Math.max(0, i - 1)];
        const p0 = points[i];
        const p1 = points[i + 1];
        const pNext = points[Math.min(n - 1, i + 2)];
        // Catmull-Rom Sec 6.4: tangent at p_i = (p_{i+1} - p_{i-1})/2, Bézier ctrl = p ± tangent/3
        // First ctrl (leaving p0): p0 + (p1 - pPrev)/6
        const tangentStart = [(p1.x - pPrev.x) / 6, (p1.y - pPrev.y) / 6];
        const cFirst: [number, number] = [p0.x + tangentStart[0], p0.y + tangentStart[1]];
        // Second ctrl (approaching p1): p1 - (pNext - p0)/6
        const tangentEnd = [(pNext.x - p0.x) / 6, (pNext.y - p0.y) / 6];
        const cSecond: [number, number] = [p1.x - tangentEnd[0], p1.y - tangentEnd[1]];
        cSucc.push(cFirst);
        cPrev.push(cSecond);
    }
    return { cSucc, cPrev };
}

const DEFAULT_UMAP: UMAPParams = { nNeighbors: 15, minDist: 0.1, spread: 1.0 };

function MiniCurve(
    { points, label, width, height, interpolation = 1 }: { points: TokenPoint[]; label: string; width: number; height: number; interpolation?: number }
) {
    const svgRef = useRef<SVGSVGElement>(null);
    useEffect(() => {
        if (svgRef.current && points.length > 0) {
            renderCurves(svgRef.current, points, width, height, { dotRadius: 2, fontSize: 0, interpolation });
        }
    }, [points, width, height, interpolation]);
    return (
        <div className="time-curves-mini">
            <div className="time-curves-mini-label">{label}</div>
            <svg ref={svgRef} width={width} height={height} className="time-curves-mini-svg" />
        </div>
    );
}

const getCharLen = (t: string) => t.replace(/^##/, "").length;

/** Approximate px per character at given font size – token widths and gaps scale with this */
const CHAR_WIDTH_RATIO = 0.55;
/** Gap between tokens as multiple of char unit – e.g. 1.8 = ~1.8 chars of space between words */
const GAP_PER_CHAR = 1.8;

/** Compute 1D timeline positions: horizontal lines, x by word length (scaled by fontSize) + gaps, each generation on its own row */
function get1DPositions(points: TokenPoint[], fontSize: number = 11): { x: number; y: number }[] {
    const bySent = new Map<number, TokenPoint[]>();
    for (const p of points) {
        if (!bySent.has(p.sentIdx)) bySent.set(p.sentIdx, []);
        bySent.get(p.sentIdx)!.push(p);
    }
    const sentIdxs = [...bySent.keys()].sort((a, b) => a - b);
    const numSents = Math.max(1, sentIdxs.length);
    const charUnit = fontSize > 0 ? fontSize * CHAR_WIDTH_RATIO : 1;
    const minTokenWidth = Math.max(3, charUnit * 0.5);
    const spaceBetween = charUnit * GAP_PER_CHAR;
    const xBySent = new Map<number, number[]>();
    for (const [sentIdx, sentPts] of bySent) {
        const n = sentPts.length;
        const totalUnits = sentPts.reduce((sum, pt) => sum + Math.max(getCharLen(pt.token) * charUnit, minTokenWidth), 0)
            + Math.max(0, n - 1) * spaceBetween;
        const positions: number[] = [];
        let cumul = 0;
        for (let i = 0; i < n; i++) {
            const pt = sentPts[i];
            const width = Math.max(getCharLen(pt.token) * charUnit, minTokenWidth);
            positions.push(totalUnits > 0 ? (cumul + width / 2) / totalUnits : 0.5);
            cumul += width + (i < n - 1 ? spaceBetween : 0);
        }
        xBySent.set(sentIdx, positions);
    }
    return points.map((p) => {
        const positions = xBySent.get(p.sentIdx)!;
        const x1d = positions[p.tokenIdx] ?? 0.5;
        const y1d = numSents > 1 ? sentIdxs.indexOf(p.sentIdx) / (numSents - 1) : 0.5;
        return { x: x1d, y: y1d };
    });
}

function renderCurves(
    svgEl: SVGSVGElement,
    allPoints: TokenPoint[],
    width: number,
    height: number,
    opts: { dotRadius?: number; fontSize?: number; interpolation?: number } = {}
) {
    const dotRadius = opts.dotRadius ?? DOT_RADIUS;
    const fontSize = opts.fontSize ?? FONT_SIZE;
    const interp = Number(opts.interpolation ?? 1);
    const svg = d3.select(svgEl);
    svg.attr("width", width).attr("height", height).html("");

    let pointsToRender = allPoints;
    if (interp < 1 && allPoints.length > 0) {
        const pos1d = get1DPositions(allPoints, fontSize || FONT_SIZE);
        const x2d = d3.extent(allPoints, p => p.x!) as [number, number];
        const y2d = d3.extent(allPoints, p => p.y!) as [number, number];
        const rx = (x2d[1] - x2d[0]) || 1;
        const ry = (y2d[1] - y2d[0]) || 1;
        const x1min = 0;
        const x1max = 1;
        const y1min = 0;
        const y1max = 1;
        pointsToRender = allPoints.map((p, i) => {
            const { x: x1, y: y1 } = pos1d[i];
            const x1In2dSpace = x2d[0] + (x1 - x1min) / (x1max - x1min || 1) * rx;
            const y1In2dSpace = y2d[0] + (y1 - y1min) / (y1max - y1min || 1) * ry;
            const blendX = (1 - interp) * x1In2dSpace + interp * p.x!;
            const blendY = (1 - interp) * y1In2dSpace + interp * p.y!;
            return { ...p, x: blendX, y: blendY };
        });
    }

    // Use fixed domain from raw UMAP so scale doesn't change during interpolation
    const rawX = d3.extent(allPoints, p => p.x!) as [number, number];
    const rawY = d3.extent(allPoints, p => p.y!) as [number, number];
    const padX = ((rawX[1] - rawX[0]) * 0.1) || 1;
    const padY = ((rawY[1] - rawY[0]) * 0.1) || 1;
    const xScale = d3.scaleLinear()
        .domain([rawX[0] - padX, rawX[1] + padX])
        .range([MARGIN.left, width - MARGIN.right]);
    const yScale = d3.scaleLinear()
        .domain([rawY[0] - padY, rawY[1] + padY])
        .range([height - MARGIN.bottom, MARGIN.top]);  // y-up: domain max -> top
    const g = svg.append("g");
    const defs = g.append("defs");
    g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "transparent")
        .attr("pointer-events", "all");
    const positionColorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);
    const pointsBySentence = new Map<number, TokenPoint[]>();
    for (const p of pointsToRender) {
        if (!pointsBySentence.has(p.sentIdx)) pointsBySentence.set(p.sentIdx, []);
        pointsBySentence.get(p.sentIdx)!.push(p);
    }
    pointsBySentence.forEach((sentencePoints, _sentIdx) => {
        const n = sentencePoints.length;
        if (n < 2) return;
        const pts = sentencePoints.map(p => ({ x: p.x!, y: p.y! }));
        const { cSucc, cPrev } = computeControlPoints(pts);
        for (let i = 0; i < n - 1; i++) {
            const a = sentencePoints[i];
            const b = sentencePoints[i + 1];
            const [c1, c2] = [cSucc[i], cPrev[i]];
            const t0 = i / (n - 1);
            const t1 = (i + 1) / (n - 1);
            const d = `M${xScale(a.x!)},${yScale(a.y!)} C${xScale(c1[0])},${yScale(c1[1])} ${xScale(c2[0])},${yScale(c2[1])} ${xScale(b.x!)},${yScale(b.y!)}`;
            const gradId = `grad-${_sentIdx}-${i}`;
            const grad = defs.append("linearGradient")
                .attr("id", gradId)
                .attr("gradientUnits", "userSpaceOnUse")
                .attr("x1", xScale(a.x!))
                .attr("y1", yScale(a.y!))
                .attr("x2", xScale(b.x!))
                .attr("y2", yScale(b.y!));
            grad.append("stop").attr("offset", "0%").attr("stop-color", positionColorScale(t0));
            grad.append("stop").attr("offset", "100%").attr("stop-color", positionColorScale(t1));
            g.append("path")
                .attr("d", d)
                .attr("fill", "none")
                .attr("stroke", `url(#${gradId})`)
                .attr("stroke-width", 2)
                .attr("stroke-opacity", 0.45)
                .attr("stroke-linecap", "round");
        }
    });
    const getPositionColor = (p: TokenPoint) => {
        const sentPts = pointsBySentence.get(p.sentIdx)!;
        const t = sentPts.length > 1 ? p.tokenIdx / (sentPts.length - 1) : 0;
        return positionColorScale(t);
    };
    const dots = g.selectAll(".token-dot").data(pointsToRender).join("g")
        .attr("class", "token-dot")
        .attr("transform", d => `translate(${xScale(d.x!)},${yScale(d.y!)})`);
    dots.append("circle")
        .attr("r", dotRadius)
        .attr("fill", d => getPositionColor(d))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);
    if (fontSize > 0) {
        dots.append("text")
            .attr("dy", -dotRadius - Math.max(2, fontSize * 0.35))
            .attr("text-anchor", "middle")
            .attr("font-size", fontSize)
            .attr("fill", "#333")
            .attr("opacity", 0.6)
            .text(d => {
                const t = d.token.replace(/^##/, "");
                return t.length > 12 ? t.slice(0, 12) + "…" : t;
            });
    }
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 4])
        .on("zoom", (event: any) => g.attr("transform", event.transform));
    svg.call(zoom as any).on("dblclick.zoom", null);
}

class SingleExampleTimeCurves extends React.Component<Props, TimeCurvesState> {
    private svgRef: React.RefObject<SVGSVGElement> = React.createRef();
    private width: number = 0;
    private height: number = 0;
    private updateRunId = 0;
    private cachedEmbeddings: TokenPoint[] | null = null;
    private cachedUmapResult: TokenPoint[] | null = null;

    constructor(props: Props) {
        super(props);
        this.state = {
            isLoading: false,
            loadingMessage: "Computing embeddings and UMAP…",
            error: null,
            umapParams: { ...DEFAULT_UMAP },
            showMultiples: false,
            multiplesResults: null,
            interpolationFraction: 1,
        };
    }

    componentDidMount() {
        this.updateVisualization();
        window.addEventListener('resize', this.handleResize);
    }

    componentDidUpdate(prevProps: Props, prevState: TimeCurvesState) {
        if (prevProps.promptGroups !== this.props.promptGroups) {
            this.cachedEmbeddings = null;
            this.cachedUmapResult = null;
            this.updateRunId++;
            this.updateVisualization();
        } else if (prevState.showMultiples !== this.state.showMultiples && this.cachedEmbeddings) {
            this.cachedUmapResult = null;
            this.updateRunId++;
            this.setState({ isLoading: true, loadingMessage: this.state.showMultiples ? "Computing small multiples…" : "Re-running UMAP…", error: null });
            this.updateVisualization(this.cachedEmbeddings);
        } else if (prevState.interpolationFraction !== this.state.interpolationFraction && this.cachedUmapResult && !this.state.showMultiples) {
            this.redrawWithInterpolation();
        }
    }

    componentWillUnmount() {
        this.updateRunId++;
        window.removeEventListener('resize', this.handleResize);
    }

    private handleResize = () => {
        if (this.cachedUmapResult && !this.state.showMultiples && this.svgRef.current) {
            const container = this.svgRef.current.parentElement;
            const w = Math.max(container?.clientWidth ?? 0, window.innerWidth - 40);
            const h = Math.max(container?.clientHeight ?? 0, Math.min(window.innerHeight * 0.85, 1000));
            this.width = Math.min(w, 5000);
            this.height = Math.min(h, 1200);
            this.redrawWithInterpolation();
        } else if (!this.state.showMultiples) {
            this.updateVisualization();
        }
    }

    private handleRerunProjection = () => {
        if (this.cachedEmbeddings) {
            this.setState({ isLoading: true, loadingMessage: "Re-running UMAP…", error: null });
            this.updateVisualization(this.cachedEmbeddings);
        }
    };

    private redrawWithInterpolation = () => {
        if (!this.svgRef.current || !this.cachedUmapResult) return;
        const interp = this.state.interpolationFraction;
        renderCurves(this.svgRef.current, this.cachedUmapResult, this.width, this.height, { interpolation: interp });
    };

    private runSmallMultiples = async (
        basePoints: TokenPoint[],
        embeddings2d: number[][],
        nNeighbors: number,
        myRunId: number,
        isAborted: () => boolean
    ) => {
        try {
            const results = await Promise.all(
                MULTIPLES_PARAMS.map(async ({ minDist, spread }) => {
                    if (isAborted()) return null;
                    const umap = new UMAP({
                        nComponents: 2,
                        nNeighbors,
                        minDist,
                        spread,
                    });
                    const coords = await umap.fitAsync(embeddings2d, () => !isAborted());
                    if (isAborted()) return null;
                    const points = basePoints.map((p, i) => ({ ...p, x: coords[i][0], y: coords[i][1] }));
                    return { minDist, spread, points };
                })
            );
            if (isAborted() || myRunId !== this.updateRunId) return;
            const valid: { minDist: number; spread: number; points: TokenPoint[] }[] = [];
            for (const r of results) {
                if (r) valid.push(r);
            }
            this.setState({ multiplesResults: valid, isLoading: false });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to compute small multiples";
            this.setState({ error: errMsg, isLoading: false });
        }
    };

    private handleParamChange = (key: keyof UMAPParams, value: number) => {
        const safe = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);
        const ranges: Record<keyof UMAPParams, [number, number]> = {
            nNeighbors: [2, 50],
            minDist: [0, 1],
            spread: [0.1, 3],
        };
        const [lo, hi] = ranges[key];
        this.setState(prev => ({
            umapParams: { ...prev.umapParams, [key]: safe(value, lo, hi) },
        }));
    };

    private async updateVisualization(cachedPoints?: TokenPoint[]) {
        const isMultiplesPath = cachedPoints != null && this.state.showMultiples;
        if (!isMultiplesPath && !this.svgRef.current) return;

        const myRunId = ++this.updateRunId;
        const isAborted = () => myRunId !== this.updateRunId;

        let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
        if (!isMultiplesPath && this.svgRef.current) {
            const container = this.svgRef.current.parentElement;
            const w = Math.max(container?.clientWidth ?? 0, window.innerWidth - 40);
            const h = Math.max(container?.clientHeight ?? 0, Math.min(window.innerHeight * 0.85, 1000));
            this.width = Math.min(w, 5000);
            this.height = Math.min(h, 1200);
            svg = d3.select(this.svgRef.current);
            svg.attr("width", this.width).attr("height", this.height).html("");
        }

        if (!cachedPoints && !this.props.promptGroups.length && svg) {
            const g = svg.append("g");
            g.append("text")
                .attr("x", this.width / 2)
                .attr("y", this.height / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("fill", "#999")
                .attr("font-size", "14px")
                .text("No generations to display");
            return;
        }

        if (!cachedPoints) this.setState({ isLoading: true, loadingMessage: "Computing embeddings and UMAP…", error: null });

        let loadingHandledByMultiples = false;
        try {
            let allPoints: TokenPoint[];
            if (cachedPoints) {
                allPoints = cachedPoints.map(p => ({ ...p }));
            } else {
                if (isAborted()) return;
                allPoints = [];
                let sentIdx = 0;
                for (let gi = 0; gi < this.props.promptGroups.length; gi++) {
                    const group = this.props.promptGroups[gi];
                    for (const gen of group.generations) {
                        if (isAborted()) return;
                        const { tokens, embeddings } = await getContextualTokenEmbeddings(gen);
                        for (let t = 0; t < tokens.length; t++) {
                            allPoints.push({
                                token: tokens[t],
                                embedding: embeddings[t],
                                sentIdx,
                                tokenIdx: t,
                                promptGroupIdx: gi,
                            });
                        }
                        sentIdx++;
                    }
                }

                if (allPoints.length === 0 && svg) {
                    const g = svg.append("g");
                    g.append("text")
                        .attr("x", this.width / 2)
                        .attr("y", this.height / 2)
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "middle")
                        .attr("fill", "#999")
                        .text("No tokens to embed");
                    this.setState({ isLoading: false });
                    return;
                }

                this.cachedEmbeddings = allPoints.map(p => ({ ...p }));
            }
            const embeddings2d = allPoints.map(p => p.embedding);
            const nNeighborsClamped = Math.max(2, Math.min(this.state.umapParams.nNeighbors, Math.floor(allPoints.length / 2)));

            if (this.state.showMultiples) {
                this.setState({ multiplesResults: null });
                loadingHandledByMultiples = true;
                this.runSmallMultiples(allPoints, embeddings2d, nNeighborsClamped, myRunId, isAborted);
                return;
            }

            const { nNeighbors, minDist, spread } = this.state.umapParams;
            const umap = new UMAP({
                nComponents: 2,
                nNeighbors: nNeighborsClamped,
                minDist,
                spread,
            });
            const coords = await umap.fitAsync(embeddings2d, () => !isAborted());

            if (isAborted()) return;
            for (let i = 0; i < allPoints.length; i++) {
                allPoints[i].x = coords[i][0];
                allPoints[i].y = coords[i][1];
            }

            this.cachedUmapResult = allPoints.map(p => ({ ...p }));
            this.redrawWithInterpolation();
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to compute visualization";
            this.setState({ error: errMsg, isLoading: false });
            if (svg) {
                const g = svg.append("g");
                g.append("text")
                    .attr("x", this.width / 2)
                    .attr("y", this.height / 2)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#c00")
                    .text(errMsg);
            }
        } finally {
            if (!loadingHandledByMultiples) this.setState({ isLoading: false });
        }
    }

    render() {
        const { umapParams, isLoading, loadingMessage, showMultiples, multiplesResults } = this.state;
        const maxNeighbors = this.cachedEmbeddings
            ? Math.floor(this.cachedEmbeddings.length / 2)
            : 50;
        const miniSize = 240;
        return (
            <div className="time-curves-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div className="time-curves-controls">
                    <div className="time-curves-view-toggle">
                        <button
                            type="button"
                            className={!showMultiples ? "active" : ""}
                            onClick={() => this.setState({ showMultiples: false })}
                            disabled={isLoading}
                        >
                            Single
                        </button>
                        <button
                            type="button"
                            className={showMultiples ? "active" : ""}
                            onClick={() => this.setState({ showMultiples: true })}
                            disabled={isLoading || !this.cachedEmbeddings}
                        >
                            Small multiples
                        </button>
                    </div>
                    {(showMultiples || this.cachedUmapResult) && (
                        <label title="Interpolate between 1D timeline (left) and UMAP projection (right)">
                            Interpolation
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.02}
                                value={this.state.interpolationFraction}
                                onChange={e => this.setState({ interpolationFraction: +e.target.value })}
                                disabled={isLoading}
                                className="time-curves-interp-slider"
                            />
                        </label>
                    )}
                    {!showMultiples && (
                        <>
                            <label title="Number of nearest neighbors (local vs global structure)">
                                nNeighbors
                                <input
                                    type="number"
                                    min={2}
                                    max={maxNeighbors}
                                    value={umapParams.nNeighbors}
                                    onChange={e => this.handleParamChange('nNeighbors', +e.target.value)}
                                    disabled={isLoading}
                                />
                            </label>
                            <label title="Min distance between points (0=tight clusters, 1=spread out)">
                                minDist
                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={umapParams.minDist}
                                    onChange={e => this.handleParamChange('minDist', +e.target.value)}
                                    disabled={isLoading}
                                />
                            </label>
                            <label title="Effective scale of embedded points">
                                spread
                                <input
                                    type="number"
                                    min={0.1}
                                    max={3}
                                    step={0.1}
                                    value={umapParams.spread}
                                    onChange={e => this.handleParamChange('spread', +e.target.value)}
                                    disabled={isLoading}
                                />
                            </label>
                            <button
                                type="button"
                                className="time-curves-rerun"
                                onClick={this.handleRerunProjection}
                                disabled={isLoading || !this.cachedEmbeddings}
                                title="Re-run UMAP with current parameters"
                            >
                                Re-run projection
                            </button>
                        </>
                    )}
                </div>
                <div className="time-curves-svg-wrap">
                    {isLoading && (
                        <div className="time-curves-loader">{loadingMessage}</div>
                    )}
                    {showMultiples ? (
                        <div className="time-curves-multiples">
                            {multiplesResults?.map((r, i) => (
                                <MiniCurve
                                    key={i}
                                    points={r.points}
                                    label={`minDist=${r.minDist} spread=${r.spread}`}
                                    width={miniSize}
                                    height={miniSize}
                                    interpolation={this.state.interpolationFraction}
                                />
                            ))}
                        </div>
                    ) : (
                        <svg
                            ref={this.svgRef}
                            id="time-curves-holder"
                            className="time-curves-svg"
                        />
                    )}
                </div>
            </div>
        );
    }
}

export default observer(SingleExampleTimeCurves);
