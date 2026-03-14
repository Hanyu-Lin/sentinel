import { describe, it, expect } from "vitest";
import { GraphNodeSchema, GraphEdgeSchema, GraphDiffSchema, CircularDepSchema } from "../graph";
import { BlastRadiusSchema } from "../blastRadius";
import { SessionEventSchema } from "../session";
import { ServerMessageSchema, ClientMessageSchema } from "../ws";

const validNode = {
  id: "src/index.ts",
  filePath: "src/index.ts",
  directory: "src",
  inDegree: 3,
  baseColor: "#6366f1",
  eventColor: null,
  visible: true,
  opacity: 1.0,
  pinned: false,
};

const validEdge = {
  source: "src/index.ts",
  target: "src/utils.ts",
  edgeType: "intra-directory" as const,
  isCircular: false,
};

const validCircularDep = {
  id: "cycle-1",
  cycleNodeIds: ["src/a.ts", "src/b.ts", "src/a.ts"],
};

const validBlastRadius = {
  downstream: ["src/utils.ts", "src/routes.ts"],
  upstream: [],
  changedNodeIds: ["src/index.ts"],
};

const validDiff = {
  addedNodes: [validNode],
  removedNodes: ["src/old.ts"],
  addedEdges: [validEdge],
  removedEdges: [{ source: "src/a.ts", target: "src/b.ts" }],
  modifiedNodes: [],
  blastRadius: validBlastRadius,
  newCircularDeps: [validCircularDep],
  resolvedCircularDeps: ["cycle-old"],
};

describe("GraphNodeSchema", () => {
  it("parses valid node", () => {
    const result = GraphNodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
  });

  it("parses node with eventColor", () => {
    const result = GraphNodeSchema.safeParse({ ...validNode, eventColor: "#22c55e" });
    expect(result.success).toBe(true);
  });

  it("rejects node missing inDegree", () => {
    const { inDegree: _, ...bad } = validNode;
    const result = GraphNodeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects node with non-integer inDegree", () => {
    const result = GraphNodeSchema.safeParse({ ...validNode, inDegree: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("GraphEdgeSchema", () => {
  it("parses valid edge", () => {
    const result = GraphEdgeSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it("parses cross-directory edge", () => {
    const result = GraphEdgeSchema.safeParse({ ...validEdge, edgeType: "cross-directory" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid edgeType", () => {
    const result = GraphEdgeSchema.safeParse({ ...validEdge, edgeType: "other" });
    expect(result.success).toBe(false);
  });
});

describe("CircularDepSchema", () => {
  it("parses valid circular dep", () => {
    const result = CircularDepSchema.safeParse(validCircularDep);
    expect(result.success).toBe(true);
  });

  it("rejects missing cycleNodeIds", () => {
    const result = CircularDepSchema.safeParse({ id: "cycle-1" });
    expect(result.success).toBe(false);
  });
});

describe("BlastRadiusSchema", () => {
  it("parses valid blast radius with downstream and upstream", () => {
    const result = BlastRadiusSchema.safeParse(validBlastRadius);
    expect(result.success).toBe(true);
  });

  it("rejects old flat affectedNodeIds shape", () => {
    const result = BlastRadiusSchema.safeParse({
      sourceNodeId: "src/index.ts",
      affectedNodeIds: ["src/utils.ts"],
      totalAffected: 1,
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });

  it("requires all three directional fields", () => {
    const result = BlastRadiusSchema.safeParse({
      downstream: ["src/utils.ts"],
      upstream: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("GraphDiffSchema", () => {
  it("parses valid diff with all new fields", () => {
    const result = GraphDiffSchema.safeParse(validDiff);
    expect(result.success).toBe(true);
  });

  it("rejects diff missing blastRadius", () => {
    const { blastRadius: _, ...bad } = validDiff;
    const result = GraphDiffSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects diff missing newCircularDeps", () => {
    const { newCircularDeps: _, ...bad } = validDiff;
    const result = GraphDiffSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("SessionEventSchema", () => {
  const validEvent = {
    id: "evt-1",
    filePaths: ["src/index.ts", "src/utils.ts"],
    eventTypes: ["modified", "modified"],
    blastRadiusCounts: { downstream: 5, upstream: 2 },
    timestamp: Date.now(),
  };

  it("parses valid session event", () => {
    const result = SessionEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it("rejects invalid eventType", () => {
    const result = SessionEventSchema.safeParse({ ...validEvent, eventTypes: ["saved"] });
    expect(result.success).toBe(false);
  });
});

describe("ServerMessageSchema", () => {
  it("parses graph.snapshot", () => {
    const msg = {
      type: "graph.snapshot",
      nodes: [validNode],
      edges: [validEdge],
      sessionHistory: [],
      activeCircularDeps: [validCircularDep],
    };
    const result = ServerMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("parses graph.diff", () => {
    const result = ServerMessageSchema.safeParse({ type: "graph.diff", diff: validDiff });
    expect(result.success).toBe(true);
  });

  it("parses session.changeEvent with filePaths array and eventTypes", () => {
    const msg = {
      type: "session.changeEvent",
      id: "evt-1",
      filePaths: ["src/index.ts"],
      eventTypes: ["modified"],
      timestamp: Date.now(),
      blastRadius: { downstream: 3, upstream: 1 },
    };
    const result = ServerMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("rejects session.changeEvent missing eventTypes", () => {
    const result = ServerMessageSchema.safeParse({
      type: "session.changeEvent",
      id: "evt-1",
      filePaths: ["src/index.ts"],
      timestamp: Date.now(),
      blastRadius: { downstream: 3, upstream: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("parses session.reset from server", () => {
    const result = ServerMessageSchema.safeParse({ type: "session.reset" });
    expect(result.success).toBe(true);
  });

  it("rejects old session.changeEvent with single filePath", () => {
    const result = ServerMessageSchema.safeParse({
      type: "session.changeEvent",
      id: "evt-1",
      filePath: "src/index.ts",
      timestamp: Date.now(),
      blastRadiusCount: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe("ClientMessageSchema", () => {
  it("parses node.togglePin", () => {
    const result = ClientMessageSchema.safeParse({
      type: "node.togglePin",
      nodeId: "src/index.ts",
    });
    expect(result.success).toBe(true);
  });

  it("rejects old pin.node", () => {
    const result = ClientMessageSchema.safeParse({
      type: "pin.node",
      nodeId: "src/index.ts",
      pinned: true,
    });
    expect(result.success).toBe(false);
  });

  it("parses session.reset from client", () => {
    const result = ClientMessageSchema.safeParse({ type: "session.reset" });
    expect(result.success).toBe(true);
  });

  it("parses config.update", () => {
    const result = ClientMessageSchema.safeParse({
      type: "config.update",
      focusMode: "hide",
      blastRadiusDirection: "downstream",
    });
    expect(result.success).toBe(true);
  });
});

describe("Round-trip serialization", () => {
  it("serializes and parses graph.snapshot", () => {
    const msg = {
      type: "graph.snapshot" as const,
      nodes: [validNode],
      edges: [validEdge],
      sessionHistory: [],
      activeCircularDeps: [],
    };
    const parsed = ServerMessageSchema.parse(msg);
    const json = JSON.stringify(parsed);
    const reparsed = ServerMessageSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(parsed);
  });

  it("serializes and parses graph.diff", () => {
    const msg = { type: "graph.diff" as const, diff: validDiff };
    const parsed = ServerMessageSchema.parse(msg);
    const json = JSON.stringify(parsed);
    const reparsed = ServerMessageSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(parsed);
  });

  it("serializes and parses node.togglePin", () => {
    const msg = { type: "node.togglePin" as const, nodeId: "src/index.ts" };
    const parsed = ClientMessageSchema.parse(msg);
    const json = JSON.stringify(parsed);
    const reparsed = ClientMessageSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(parsed);
  });
});
