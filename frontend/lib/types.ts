export type Verdict = "PASS" | "FAIL" | "UNVERIFIED" | "NO_RULE" | "REFUSE";

export interface Fact {
  subject: string;
  metric: string;
  value: number;
  operator: string;
  threshold: number;
  unit: string;
  clause_id: string;
  status: "PASS" | "FAIL";
}

export interface ByRule {
  clause_id: string;
  metric: string;
  requirement: string;
  checked: number;
  failed: number;
}

export interface Verification {
  verdict: Verdict;
  facts: Fact[];
  unverified: { metric: string; clause_id: string; reason: string }[];
  by_rule: ByRule[];
}

export interface RetrievedClause {
  id: string;
  score: number;
  hop?: number;
}

export interface TraceStep {
  node: string;
  ms: number;
  [key: string]: unknown;
}

export interface AskResponse {
  answer: string;
  verification: Verification | null;
  rules: unknown[];
  rejected_rules: unknown[];
  attempts: { sql: string; error: string | null; stage: string }[];
  retrieved: RetrievedClause[];
  narrative_status: string;
  trace: TraceStep[];
}

export interface GraphNode {
  id: string;
  doc: string;
  title: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "ref" | "term";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ProgressEvent {
  node: string;
  label: string;
  detail?: { attempt: number; error: string };
}
