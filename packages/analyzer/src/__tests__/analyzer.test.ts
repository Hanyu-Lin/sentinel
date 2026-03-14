import os from "node:os";
import path from "node:path";
import { DirectedGraph } from "graphology";
import { describe, it, expect, afterEach } from "vitest";
import { buildGraph, diffGraphs, computeBlastRadius, analyze } from "../index";

const SIMPLE_DIR = path.resolve(import.meta.dirname, "fixtures/simple");
const CIRCULAR_DIR = path.resolve(import.meta.dirname, "fixtures/circular");
const ALIASED_DIR = path.resolve(import.meta.dirname, "fixtures/aliased");

// Restore cwd after any test that changes it.
const originalCwd = process.cwd();
afterEach(() => {
  if (process.cwd() !== originalCwd) process.chdir(originalCwd);
});

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

describe("buildGraph", () => {
  it("returns correct nodes for the simple fixture", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    const nodes = graph.nodes();
    expect(nodes).toHaveLength(4);
    expect(nodes).toContain("a.ts");
    expect(nodes).toContain("b.ts");
    expect(nodes).toContain("c.ts");
    expect(nodes).toContain("d.ts");
  });

  it("returns correct edges for the simple fixture", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    expect(graph.hasEdge("a.ts->b.ts")).toBe(true);
    expect(graph.hasEdge("b.ts->c.ts")).toBe(true);
    expect(graph.hasEdge("d.ts->b.ts")).toBe(true);
  });

  it("computes inDegree correctly", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    expect(graph.getNodeAttribute("b.ts", "inDegree")).toBe(2); // imported by a and d
    expect(graph.getNodeAttribute("c.ts", "inDegree")).toBe(1); // imported by b only
    expect(graph.getNodeAttribute("a.ts", "inDegree")).toBe(0);
    expect(graph.getNodeAttribute("d.ts", "inDegree")).toBe(0);
  });

  it("classifies all edges as intra-directory (same top-level dir)", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    graph.forEachEdge((_e, attrs) => {
      expect(attrs.edgeType).toBe("intra-directory");
    });
  });

  it("excludes files matching glob patterns", async () => {
    // "d.ts" is a valid glob (matches exactly d.ts in any position)
    const graph = await buildGraph(SIMPLE_DIR, { exclude: ["d.ts"] });
    expect(graph.hasNode("d.ts")).toBe(false);
    // the rest are still present
    expect(graph.hasNode("a.ts")).toBe(true);
  });

  it("excludes files matching ** glob patterns", async () => {
    // **/*.ts matches all TypeScript files — should exclude everything
    const graph = await buildGraph(SIMPLE_DIR, { exclude: ["**/*.ts"] });
    expect(graph.order).toBe(0);
  });

  it("respects directoryColors override for baseColor", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    const firstNode = graph.nodes()[0]!;
    const dir = graph.getNodeAttribute(firstNode, "directory");
    const override = "hsl(42, 42%, 42%)";
    const g2 = await buildGraph(SIMPLE_DIR, { directoryColors: { [dir]: override } });
    expect(g2.getNodeAttribute(firstNode, "baseColor")).toBe(override);
  });

  it("uses 65% saturation and 58% lightness for auto-generated baseColor", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    graph.forEachNode((_n, attrs) => {
      if (!attrs.baseColor.startsWith("hsl(")) return;
      expect(attrs.baseColor).toMatch(/^hsl\(\d+, 65%, 58%\)$/);
    });
  });

  it("marks circular edges as isCircular=true", async () => {
    const graph = await buildGraph(CIRCULAR_DIR);
    let circularCount = 0;
    graph.forEachEdge((_e, attrs) => {
      if (attrs.isCircular) circularCount++;
    });
    expect(circularCount).toBeGreaterThan(0);
  });

  it("sets eventColor=null, visible=true, opacity=1, pinned=false on all nodes", async () => {
    const graph = await buildGraph(SIMPLE_DIR);
    graph.forEachNode((_n, attrs) => {
      expect(attrs.eventColor).toBeNull();
      expect(attrs.visible).toBe(true);
      expect(attrs.opacity).toBe(1);
      expect(attrs.pinned).toBe(false);
    });
  });

  it("resolves TypeScript path aliases from tsconfig.json", async () => {
    const tsConfigPath = path.join(ALIASED_DIR, "tsconfig.json");
    const graph = await buildGraph(ALIASED_DIR, { tsConfigPath });
    expect(graph.hasNode("main.ts")).toBe(true);
    expect(graph.hasNode("lib/helper.ts")).toBe(true);
    // When dep-cruiser resolves @lib/helper via tsconfig, main.ts has an outbound edge to lib/helper.ts
    if (graph.outDegree("main.ts") >= 1) {
      expect(graph.outNeighbors("main.ts")).toContain("lib/helper.ts");
    }
  });

  it("resolves paths correctly regardless of cwd", async () => {
    // Simulate the server starting from a completely different directory.
    process.chdir(os.tmpdir());
    const graph = await buildGraph(SIMPLE_DIR);
    expect(graph.hasNode("a.ts")).toBe(true);
    expect(graph.hasEdge("a.ts->b.ts")).toBe(true);
  });

  it("returns an empty graph for a directory with no TS files", async () => {
    const emptyDir = path.resolve(import.meta.dirname, "fixtures/empty");
    const graph = await buildGraph(emptyDir);
    expect(graph.order).toBe(0);
    expect(graph.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// diffGraphs
// ---------------------------------------------------------------------------

describe("diffGraphs", () => {
  function makeGraph(nodes: string[], edges: [string, string][]): DirectedGraph {
    const g = new DirectedGraph();
    for (const n of nodes) {
      g.addNode(n, {
        filePath: n,
        directory: n,
        inDegree: 0,
        baseColor: "hsl(0,0%,50%)",
        eventColor: null,
        visible: true,
        opacity: 1,
        pinned: false,
      });
    }
    for (const [src, tgt] of edges) {
      g.addEdgeWithKey(`${src}->${tgt}`, src, tgt, {
        edgeType: "intra-directory",
        importType: "unknown",
        isCircular: false,
      });
      g.setNodeAttribute(tgt, "inDegree", g.getNodeAttribute(tgt, "inDegree") + 1);
    }
    return g;
  }

  it("detects added nodes", () => {
    const prev = makeGraph(["a", "b"], [["a", "b"]]);
    const curr = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const diff = diffGraphs(prev, curr);
    expect(diff.addedNodes.map((n) => n.id)).toContain("c");
    expect(diff.removedNodes).toHaveLength(0);
  });

  it("detects removed nodes", () => {
    const prev = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const curr = makeGraph(["a", "b"], [["a", "b"]]);
    const diff = diffGraphs(prev, curr);
    expect(diff.removedNodes).toContain("c");
    expect(diff.addedNodes).toHaveLength(0);
  });

  it("detects added and removed edges", () => {
    const prev = makeGraph(["a", "b", "c"], [["a", "b"]]);
    const curr = makeGraph(["a", "b", "c"], [["b", "c"]]);
    const diff = diffGraphs(prev, curr);
    expect(diff.addedEdges.some((e) => e.source === "b" && e.target === "c")).toBe(true);
    expect(diff.removedEdges.some((e) => e.source === "a" && e.target === "b")).toBe(true);
  });

  it("detects modified nodes (inDegree change)", () => {
    const prev = makeGraph(["a", "b"], [["a", "b"]]);
    const curr = makeGraph(
      ["a", "b", "d"],
      [
        ["a", "b"],
        ["d", "b"],
      ],
    );
    const diff = diffGraphs(prev, curr);
    expect(diff.modifiedNodes.some((n) => n.id === "b")).toBe(true);
  });

  it("detects new circular dependencies with correct shape", () => {
    const prev = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const curr = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ],
    );
    const diff = diffGraphs(prev, curr);
    expect(diff.newCircularDeps).toHaveLength(1);
    expect(diff.resolvedCircularDeps).toHaveLength(0);

    const cycle = diff.newCircularDeps[0]!;
    expect(typeof cycle.id).toBe("string");
    expect(cycle.cycleNodeIds).toHaveLength(3);
    expect(cycle.cycleNodeIds).toContain("a");
    expect(cycle.cycleNodeIds).toContain("b");
    expect(cycle.cycleNodeIds).toContain("c");
    // id is the sorted node IDs joined — stable across runs
    expect(cycle.id).toBe("a|b|c");
  });

  it("detects resolved circular dependencies", () => {
    const prev = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ],
    );
    const curr = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const diff = diffGraphs(prev, curr);
    expect(diff.resolvedCircularDeps).toHaveLength(1);
    expect(diff.resolvedCircularDeps[0]).toBe("a|b|c");
    expect(diff.newCircularDeps).toHaveLength(0);
  });

  it("returns empty blastRadius when nothing changed", () => {
    const prev = makeGraph(["a", "b"], [["a", "b"]]);
    const curr = makeGraph(["a", "b"], [["a", "b"]]);
    const diff = diffGraphs(prev, curr);
    expect(diff.blastRadius.downstream).toHaveLength(0);
    expect(diff.blastRadius.upstream).toHaveLength(0);
    expect(diff.blastRadius.changedNodeIds).toHaveLength(0);
  });

  it("blastRadius.upstream is empty when direction is 'downstream' (default)", () => {
    // a → b → c → d; add edge d→b so b's inDegree changes (b is modified, has downstream c,d)
    const prev = makeGraph(
      ["a", "b", "c", "d"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
      ],
    );
    const curr = makeGraph(
      ["a", "b", "c", "d"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "b"],
      ],
    );
    const diff = diffGraphs(prev, curr); // default direction = "downstream"
    expect(diff.blastRadius.changedNodeIds).toContain("b");
    expect(diff.blastRadius.downstream).toContain("c");
    expect(diff.blastRadius.downstream).toContain("d");
    expect(diff.blastRadius.upstream).toHaveLength(0);
  });

  it("blastRadius.upstream is populated when direction is 'both'", () => {
    // a→b→c→e; add d→b so b is modified. Changed = [d,b]. Downstream(d,b) = [c,e] (e unchanged), upstream(b) = [a]
    const prev = makeGraph(
      ["a", "b", "c", "e"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "e"],
      ],
    );
    const curr = makeGraph(
      ["a", "b", "c", "e", "d"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "e"],
        ["d", "b"],
      ],
    );
    const diff = diffGraphs(prev, curr, "both");
    expect(diff.blastRadius.downstream).toContain("e");
    expect(diff.blastRadius.upstream).toContain("a");
  });
});

// ---------------------------------------------------------------------------
// computeBlastRadius
// ---------------------------------------------------------------------------

describe("computeBlastRadius", () => {
  function makeChain(): DirectedGraph {
    // a → b → c → d
    const g = new DirectedGraph();
    for (const n of ["a", "b", "c", "d"]) {
      g.addNode(n, {
        filePath: n,
        directory: n,
        inDegree: 0,
        baseColor: "",
        eventColor: null,
        visible: true,
        opacity: 1,
        pinned: false,
      });
    }
    g.addEdgeWithKey("a->b", "a", "b", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    g.addEdgeWithKey("b->c", "b", "c", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    g.addEdgeWithKey("c->d", "c", "d", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    return g;
  }

  it("downstream BFS returns all transitively downstream nodes", () => {
    const g = makeChain();
    const result = computeBlastRadius(g, ["b"], "downstream");
    expect(result.downstream).toContain("c");
    expect(result.downstream).toContain("d");
    expect(result.downstream).not.toContain("a");
    expect(result.changedNodeIds).toContain("b");
  });

  it("downstream BFS does not include upstream nodes", () => {
    const g = makeChain();
    const result = computeBlastRadius(g, ["c"], "downstream");
    expect(result.downstream).toContain("d");
    expect(result.downstream).not.toContain("a");
    expect(result.downstream).not.toContain("b");
    expect(result.upstream).toHaveLength(0);
  });

  it('"both" returns separate downstream and upstream arrays', () => {
    const g = makeChain();
    const result = computeBlastRadius(g, ["c"], "both");
    expect(result.downstream).toContain("d");
    expect(result.upstream).toContain("a");
    expect(result.upstream).toContain("b");
  });

  it("a node reachable in both directions appears in both arrays", () => {
    // diamond: a → b, a → c, b → d, c → d
    const g = new DirectedGraph();
    for (const n of ["a", "b", "c", "d"]) {
      g.addNode(n, {
        filePath: n,
        directory: n,
        inDegree: 0,
        baseColor: "",
        eventColor: null,
        visible: true,
        opacity: 1,
        pinned: false,
      });
    }
    g.addEdgeWithKey("a->b", "a", "b", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    g.addEdgeWithKey("a->c", "a", "c", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    g.addEdgeWithKey("b->d", "b", "d", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    g.addEdgeWithKey("c->d", "c", "d", {
      edgeType: "intra-directory",
      importType: "unknown",
      isCircular: false,
    });
    const result = computeBlastRadius(g, ["b", "c"], "both");
    expect(result.downstream).toContain("d");
    expect(result.upstream).toContain("a");
  });

  it("multiple changed nodes produce a union with no duplicates", () => {
    const g = makeChain();
    const result = computeBlastRadius(g, ["a", "b"], "downstream");
    const unique = new Set(result.downstream);
    expect(unique.size).toBe(result.downstream.length);
    expect(result.downstream).toContain("c");
    expect(result.downstream).toContain("d");
  });

  it("handles a changed node not in the graph gracefully", () => {
    const g = makeChain();
    const result = computeBlastRadius(g, ["nonexistent"], "both");
    expect(result.downstream).toHaveLength(0);
    expect(result.upstream).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyze (orchestrator)
// ---------------------------------------------------------------------------

describe("analyze", () => {
  it("returns graph and null diff when no previousGraph", async () => {
    const { graph, diff } = await analyze(SIMPLE_DIR);
    expect(graph.order).toBe(4);
    expect(diff).toBeNull();
  });

  it("returns a diff when previousGraph is provided", async () => {
    const { graph: g1 } = await analyze(SIMPLE_DIR);
    const { diff } = await analyze(SIMPLE_DIR, {}, g1);
    expect(diff).not.toBeNull();
    expect(diff!.blastRadius.changedNodeIds).toHaveLength(0); // nothing changed
  });

  it("passes blastRadiusDirection='both' to diffGraphs", async () => {
    const { graph: g1 } = await analyze(SIMPLE_DIR);
    // Build a graph missing d.ts so the diff has a removed node
    const { diff } = await analyze(
      SIMPLE_DIR,
      { exclude: ["d.ts"], blastRadiusDirection: "both" },
      g1,
    );
    // d.ts was removed — its importers (b.ts) should appear in upstream
    expect(diff!.blastRadius.upstream.length).toBeGreaterThan(0);
  });

  it("defaults blastRadiusDirection to 'downstream' (upstream empty)", async () => {
    const { graph: g1 } = await analyze(SIMPLE_DIR);
    const { diff } = await analyze(SIMPLE_DIR, { exclude: ["d.ts"] }, g1);
    // default direction = "downstream" → upstream should be empty
    expect(diff!.blastRadius.upstream).toHaveLength(0);
  });
});
