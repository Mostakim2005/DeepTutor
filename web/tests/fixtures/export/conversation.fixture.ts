import type { InputMessage } from "../../../lib/export/adapter";
import type { ExportMetadata } from "../../../lib/export/types";

export const FIXED_EXPORT_DATE = new Date("2026-01-15T12:00:00.000Z");

export const EXPORT_FIXTURE_METADATA: ExportMetadata = {
  title: "Deterministic Export Fixture",
  sessionId: "fixture-session-01",
  workspaceId: "ws-stem",
  workspaceName: "STEM Workspace",
  capability: "deep_solve",
  exportedAt: FIXED_EXPORT_DATE,
};

export const EXPORT_FIXTURE_MESSAGES: InputMessage[] = [
  {
    id: "u1",
    role: "user",
    content:
      "Compare the accented operators, provide a Python norm-squared snippet, and summarize in Japanese.",
    timestamp: 1768478100000,
  },
  {
    id: "a1",
    role: "assistant",
    capability: "deep_solve",
    model: "deepseek-r1",
    timestamp: 1768478200000,
    content: [
      "Using the accented relation $\\hat{x} = \\vec{v} + \\tilde{\\alpha}$, the stationary equation is:",
      "",
      "$$\\hat{H}\\psi = E\\psi$$",
      "",
      "```python",
      "def norm_sq(a: float, b: float) -> float:",
      "    return a * a + b * b",
      "```",
      "",
      "| Metric | Estimate | Count |",
      "| --- | --- | --- |",
      "| FIXTURE_METRIC_ALPHA | 3.14 | 42 |",
      "| FIXTURE_METRIC_BETA | 2.71 | 7 |",
      "",
      "勾股定理（ピタゴラスの定理）：直角三角形の斜辺の二乗は他の二辺の二乗の和に等しい。",
    ].join("\n"),
    events: [
      {
        type: "thinking",
        content:
          "Verify the operator notation, accent symbols, and table formatting.",
        timestamp: 1768478150000,
        turn_id: "turn-fixture-1",
        seq: 1,
        source: "deep_solve",
        stage: "reasoning",
        metadata: {},
      },
      {
        type: "tool_call",
        content: "paper_search",
        timestamp: 1768478160000,
        turn_id: "turn-fixture-1",
        seq: 2,
        source: "deep_solve",
        stage: "exploring",
        metadata: {
          call_id: "c1",
          tool_name: "paper_search",
          args: { query: "spectral operator" },
        },
      },
      {
        type: "tool_result",
        content: "Found 1 canonical reference.",
        timestamp: 1768478170000,
        turn_id: "turn-fixture-1",
        seq: 3,
        source: "deep_solve",
        stage: "exploring",
        metadata: {
          call_id: "c1",
        },
      },
      {
        type: "sources",
        content: "",
        timestamp: 1768478180000,
        turn_id: "turn-fixture-1",
        seq: 4,
        source: "deep_solve",
        stage: "responding",
        metadata: {
          sources: [
            {
              title: "Spectral Theory Reference",
              url: "https://example.org/spectral-theory",
              snippet: "Core operator identities.",
            },
          ],
        },
      },
    ],
    attachments: [
      {
        type: "note",
        filename: "proof-notes.txt",
        mime_type: "text/plain",
        extracted_text: "Lemma 1: Self-adjoint operators have real eigenvalues.",
      },
    ],
  },
];
