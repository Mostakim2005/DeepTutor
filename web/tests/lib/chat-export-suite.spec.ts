import { describe, expect, it } from "vitest";
import {
  exportSession,
  DEFAULT_EXPORT_FILTER_OPTIONS,
  type ExportFilterOptions,
} from "../../lib/export";
import {
  normalizeMessages,
  extractMarkdownTables,
  extractThinkTags,
  type InputMessage,
} from "../../lib/export/adapter";

describe("Export Adapter & Extractors", () => {
  it("extracts <think> tags from model reasoning content", () => {
    const raw = "<think>Let us analyze the problem step by step.</think>The solution is x = 42.";
    const result = extractThinkTags(raw);
    expect(result.thinking).toBe("Let us analyze the problem step by step.");
    expect(result.content).toBe("The solution is x = 42.");
  });

  it("extracts Markdown tables into structured headers and rows", () => {
    const md = `Here is a data table:
| Name | Score | Status |
| :--- | :---: | ---: |
| Alice | 95 | Pass |
| Bob | 82 | Pass |

More discussion follows.`;

    const { tables } = extractMarkdownTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(["Name", "Score", "Status"]);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows[0]).toEqual(["Alice", "95", "Pass"]);
    expect(tables[0].rows[1]).toEqual(["Bob", "82", "Pass"]);
  });

  it("normalizes DeepTutor messages and StreamEvents into standard export structure", () => {
    const input: InputMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Calculate the integral of x^2 and fetch related papers.",
        timestamp: 1700000000000,
      },
      {
        id: "2",
        role: "assistant",
        content: "The integral of $x^2$ is $\\frac{x^3}{3} + C$.\n\n| Term | Power |\n| --- | --- |\n| x^2 | 2 |",
        capability: "deep_solve",
        model: "deepseek-r1",
        timestamp: 1700000005000,
        events: [
          {
            type: "thinking",
            content: "Using the power rule for integration.",
            timestamp: 1700000001000,
            turn_id: "t1",
            seq: 1,
            source: "deep_solve",
            stage: "reasoning",
            metadata: {},
          },
          {
            type: "tool_call",
            content: "paper_search",
            timestamp: 1700000002000,
            turn_id: "t1",
            seq: 2,
            source: "deep_solve",
            stage: "exploring",
            metadata: {
              call_id: "c1",
              tool_name: "paper_search",
              args: { query: "calculus integration" },
            },
          },
          {
            type: "tool_result",
            content: "Found 2 papers on arXiv.",
            timestamp: 1700000003000,
            turn_id: "t1",
            seq: 3,
            source: "deep_solve",
            stage: "exploring",
            metadata: { call_id: "c1" },
          },
          {
            type: "sources",
            content: "",
            timestamp: 1700000004000,
            turn_id: "t1",
            seq: 4,
            source: "deep_solve",
            stage: "responding",
            metadata: {
              sources: [
                { title: "Calculus Foundations", url: "https://arxiv.org/abs/1234.5678" },
              ],
            },
          },
        ],
      },
    ];

    const normalized = normalizeMessages(input);
    expect(normalized).toHaveLength(2);

    // User message
    expect(normalized[0].role).toBe("user");
    expect(normalized[0].content).toContain("Calculate the integral");

    // Assistant message
    const ast = normalized[1];
    expect(ast.role).toBe("assistant");
    expect(ast.thinking).toBe("Using the power rule for integration.");
    expect(ast.toolCalls).toHaveLength(1);
    expect(ast.toolCalls![0].name).toBe("paper_search");
    expect(ast.toolCalls![0].result).toBe("Found 2 papers on arXiv.");
    expect(ast.sources).toHaveLength(1);
    expect(ast.sources![0].url).toBe("https://arxiv.org/abs/1234.5678");
    expect(ast.tables).toHaveLength(1);
  });
});

describe("Multi-Format Export Engines", () => {
  const sampleMessages: InputMessage[] = [
    {
      id: "1",
      role: "user",
      content: "Explain the Pythagorean theorem.",
      timestamp: 1700000000000,
    },
    {
      id: "2",
      role: "assistant",
      content: "The formula is $a^2 + b^2 = c^2$.\n\n| Side | Value |\n| --- | --- |\n| a | 3 |\n| b | 4 |\n| c | 5 |",
      capability: "math_animator",
      model: "gpt-4o",
      timestamp: 1700000005000,
      events: [
        {
          type: "thinking",
          content: "Triangle sides are related by hypotenuse theorem.",
          timestamp: 1700000001000,
          turn_id: "t1",
          seq: 1,
          source: "math_animator",
          stage: "concept_analysis",
          metadata: {},
        },
      ],
    },
  ];

  const meta = {
    title: "Geometry Lesson",
    workspaceName: "Math Workspace",
    exportedAt: new Date(1700000010000),
  };

  it("exports to Word (.docx) with OMML math equations", async () => {
    const result = await exportSession(sampleMessages, "docx", DEFAULT_EXPORT_FILTER_OPTIONS, meta);
    expect(result.filename).toMatch(/geometry-lesson-\d{4}-\d{2}-\d{2}\.docx/i);
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.blob.size).toBeGreaterThan(1000);
  });

  it("exports to Excel (.xlsx) with dedicated table sheets", async () => {
    const result = await exportSession(sampleMessages, "xlsx", DEFAULT_EXPORT_FILTER_OPTIONS, meta);
    expect(result.filename).toMatch(/geometry-lesson-\d{4}-\d{2}-\d{2}\.xlsx/i);
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.blob.size).toBeGreaterThan(1000);
  });

  it("exports to Standalone HTML with dark/light mode and KaTeX math", async () => {
    const result = await exportSession(sampleMessages, "html", DEFAULT_EXPORT_FILTER_OPTIONS, meta);
    expect(result.filename).toMatch(/geometry-lesson-\d{4}-\d{2}-\d{2}\.html/i);
    const html = await result.blob.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Geometry Lesson");
    expect(html).toContain("katex");
    expect(html).toContain("Reasoning &amp; Chain of Thought");
  });

  it("exports to PDF via jsPDF", async () => {
    const result = await exportSession(sampleMessages, "pdf", DEFAULT_EXPORT_FILTER_OPTIONS, meta);
    expect(result.filename).toMatch(/geometry-lesson-\d{4}-\d{2}-\d{2}\.pdf/i);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.blob.size).toBeGreaterThan(500);
  });

  it("exports to Markdown with YAML frontmatter and folded details", async () => {
    const result = await exportSession(sampleMessages, "markdown", DEFAULT_EXPORT_FILTER_OPTIONS, meta);
    expect(result.filename).toMatch(/geometry-lesson-\d{4}-\d{2}-\d{2}\.md/i);
    const md = await result.blob.text();
    expect(md).toContain("---");
    expect(md).toContain('title: "Geometry Lesson"');
    expect(md).toContain("<details>");
    expect(md).toContain("Reasoning Process");
    expect(md).toContain("$a^2 + b^2 = c^2$");
  });

  it("exports to structured JSON and respects granular content toggles", async () => {
    // Exclude thinking and user prompts
    const toggledOptions: ExportFilterOptions = {
      ...DEFAULT_EXPORT_FILTER_OPTIONS,
      includeUserPrompts: false,
      includeThinking: false,
    };
    const result = await exportSession(sampleMessages, "json", toggledOptions, meta);
    const parsed = JSON.parse(await result.blob.text());

    expect(parsed.metadata.title).toBe("Geometry Lesson");
    // User prompt excluded
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe("assistant");
    // Thinking excluded
    expect(parsed.messages[0].thinking).toBeUndefined();
  });

  it("filters exported messages strictly using selectedMessageIds", async () => {
    // Only select the assistant message id: "2"
    const selectedOptions: ExportFilterOptions = {
      ...DEFAULT_EXPORT_FILTER_OPTIONS,
      selectedMessageIds: ["2"],
    };
    const result = await exportSession(sampleMessages, "json", selectedOptions, meta);
    const parsed = JSON.parse(await result.blob.text());

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].id).toBe("2");
    expect(parsed.messages[0].role).toBe("assistant");
  });
});
