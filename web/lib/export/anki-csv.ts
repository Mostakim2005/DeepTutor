/**
 * Anki-importable CSV flashcard exporter (L-03) for Quiz and Mastery sessions.
 *
 * Output schema: `front,back,tags,source_session` (RFC 4180 CSV with UTF-8 BOM
 * so Anki and Excel preserve Unicode and math cleanly).
 */

import type { QuizQuestion } from "@/lib/quiz-types";
import type { MasteryGradeResult, MasteryQuestion } from "@/lib/mastery-question";
import { triggerDownload } from "./exporter";

export interface AnkiFlashcardRow {
  front: string;
  back: string;
  tags: string[];
  sourceSession: string;
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function sanitizeAnkiTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_:/-]/g, "");
}

function formatTags(tags: string[]): string {
  const unique = Array.from(
    new Set(tags.map(sanitizeAnkiTag).filter(Boolean)),
  );
  return unique.join(" ");
}

/**
 * Convert deep_question QuizQuestion items into Anki flashcard rows.
 */
export function quizQuestionsToAnkiCards(
  questions: QuizQuestion[],
  sourceSession = "",
  extraTags: string[] = [],
): AnkiFlashcardRow[] {
  return questions.map((q) => {
    const frontParts: string[] = [q.question.trim()];
    if (q.options && Object.keys(q.options).length > 0) {
      const optionLines = Object.entries(q.options)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key}. ${val}`);
      frontParts.push(optionLines.join("\n"));
    }

    const backParts: string[] = [];
    if (q.correct_answer?.trim()) {
      backParts.push(`Answer: ${q.correct_answer.trim()}`);
    }
    if (q.explanation?.trim()) {
      backParts.push(q.explanation.trim());
    }

    const tags = [
      "deeptutor",
      "quiz",
      q.question_type || "",
      q.difficulty || "",
      q.concentration || "",
      ...extraTags,
    ];

    return {
      front: frontParts.filter(Boolean).join("\n\n"),
      back: backParts.filter(Boolean).join("\n\n"),
      tags,
      sourceSession,
    };
  });
}

/**
 * Convert mastery_path MasteryQuestion items (and optional grade results) into
 * Anki flashcard rows.
 */
export function masteryQuestionsToAnkiCards(
  questions: MasteryQuestion[],
  gradesById: Record<string, MasteryGradeResult> = {},
  sourceSession = "",
  extraTags: string[] = [],
): AnkiFlashcardRow[] {
  const flat: MasteryQuestion[] = [];
  for (const item of questions) {
    if (item.questions && item.questions.length > 0) {
      flat.push(...item.questions);
    } else {
      flat.push(item);
    }
  }

  return flat.map((q) => {
    const grade = gradesById[q.questionId];
    const frontParts: string[] = [q.prompt.trim()];
    if (q.options && q.options.length > 0) {
      frontParts.push(q.options.map((opt) => `${opt.label}. ${opt.body}`).join("\n"));
    }

    const backParts: string[] = [];
    if (grade) {
      const answerText = [grade.correctLabel, grade.correctBody]
        .filter(Boolean)
        .join(". ")
        .trim();
      if (answerText) backParts.push(`Answer: ${answerText}`);
      if (grade.explanation?.trim()) backParts.push(grade.explanation.trim());
    }

    const tags = [
      "deeptutor",
      "mastery",
      q.objectiveName || "",
      q.difficulty || "",
      q.questionType || "",
      ...extraTags,
    ];

    return {
      front: frontParts.filter(Boolean).join("\n\n"),
      back: backParts.filter(Boolean).join("\n\n"),
      tags,
      sourceSession,
    };
  });
}

/**
 * Serialize Anki flashcard rows into an RFC 4180 CSV string with header
 * `front,back,tags,source_session`.
 */
export function serializeAnkiCsv(cards: AnkiFlashcardRow[]): string {
  const lines = ["front,back,tags,source_session"];
  for (const card of cards) {
    lines.push(
      [
        escapeCsvCell(card.front),
        escapeCsvCell(card.back),
        escapeCsvCell(formatTags(card.tags)),
        escapeCsvCell(card.sourceSession),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildAnkiCsvBlob(cards: AnkiFlashcardRow[]): Blob {
  const csv = serializeAnkiCsv(cards);
  return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
}

export function downloadAnkiCsv(
  cards: AnkiFlashcardRow[],
  filenamePrefix = "deeptutor-flashcards",
): void {
  const safePrefix = filenamePrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "deeptutor-flashcards";
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(buildAnkiCsvBlob(cards), `${safePrefix}-${dateStr}.csv`);
}
