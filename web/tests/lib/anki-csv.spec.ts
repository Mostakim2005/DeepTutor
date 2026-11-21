import { describe, expect, it } from "vitest";
import {
  masteryQuestionsToAnkiCards,
  quizQuestionsToAnkiCards,
  serializeAnkiCsv,
} from "@/lib/export/anki-csv";
import type { QuizQuestion } from "@/lib/quiz-types";
import type { MasteryGradeResult, MasteryQuestion } from "@/lib/mastery-question";

describe("anki-csv exporter (L-03)", () => {
  it("serializes QuizQuestion items with RFC 4180 escaping", () => {
    const questions: QuizQuestion[] = [
      {
        question_id: "q1",
        question: 'What is the derivative of "x^2", with respect to x?',
        question_type: "choice",
        options: { A: "x", B: "2x" },
        correct_answer: "B",
        explanation: "Power rule: d/dx(x^n) = n*x^(n-1).",
        difficulty: "medium",
        concentration: "Calculus",
      },
    ];

    const cards = quizQuestionsToAnkiCards(questions, "sess-quiz-01");
    expect(cards).toHaveLength(1);

    const csv = serializeAnkiCsv(cards);
    expect(csv.startsWith("front,back,tags,source_session\n")).toBe(true);
    expect(csv).toContain('""x^2""');
    expect(csv).toContain("A. x\nB. 2x");
    expect(csv).toContain("Answer: B");
    expect(csv).toContain("deeptutor quiz choice medium calculus");
    expect(csv).toContain("sess-quiz-01");
  });

  it("serializes MasteryQuestion items with matched grade results", () => {
    const questions: MasteryQuestion[] = [
      {
        questionId: "mq-1",
        prompt: "State Bayes' theorem.",
        questionType: "open",
        objectiveName: "Conditional Probability",
        difficulty: "hard",
        attempt: 1,
        options: [],
        allowFreeText: true,
      },
    ];
    const grades: Record<string, MasteryGradeResult> = {
      "mq-1": {
        questionId: "mq-1",
        isCorrect: true,
        learnerAnswer: "P(A|B) = P(B|A)P(A)/P(B)",
        correctLabel: "",
        correctBody: "P(A|B) = P(B|A)P(A)/P(B)",
        explanation: "Relates posterior to likelihood and prior.",
      },
    };

    const cards = masteryQuestionsToAnkiCards(questions, grades, "sess-mastery-02");
    const csv = serializeAnkiCsv(cards);
    expect(csv).toContain("State Bayes' theorem.");
    expect(csv).toContain("Answer: P(A|B) = P(B|A)P(A)/P(B)");
    expect(csv).toContain("deeptutor mastery conditional-probability hard open");
    expect(csv).toContain("sess-mastery-02");
  });
});
