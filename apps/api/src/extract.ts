import { z } from "zod";
import { extractFromText, type ExtractedTask } from "@pm/core";

const modelSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        rank: z.number().int().min(1).max(10).optional(),
        estimateMinutes: z.number().int().positive().max(480).optional(),
        deadline: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export async function extractTasks(text: string, nowIso: string, zone: string): Promise<{
  tasks: ExtractedTask[];
  modelOutput: unknown;
}> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { tasks: [extractFromText(text, nowIso, zone)], modelOutput: null };
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extract actionable tasks from the message. Reply with JSON only: {"tasks":[{"title":string,"rank":number 1-10,"estimateMinutes":number,"deadline":string|null}]}. Deadline must be an ISO timestamp or null. Today is ${nowIso} in ${zone}.\n\n${text}`,
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = modelSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { tasks: [extractFromText(text, nowIso, zone)], modelOutput: { raw, error: parsed.error.flatten() } };
    }
    return {
      tasks: parsed.data.tasks.map((task) => ({
        title: task.title.slice(0, 160),
        rank: task.rank ?? 5,
        estimateMinutes: task.estimateMinutes ?? 30,
        deadline: task.deadline ?? null,
      })),
      modelOutput: parsed.data,
    };
  } catch (error) {
    return {
      tasks: [extractFromText(text, nowIso, zone)],
      modelOutput: { error: error instanceof Error ? error.message : "gemini failed" },
    };
  }
}
