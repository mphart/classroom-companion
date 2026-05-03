import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClientError } from "../lib/errors";
import { parseYoutubePipeline } from "../lib/youtubeAudioParse";

vi.mock("../lib/youtubeAudioParse", () => ({
  parseYoutubePipeline: vi.fn(),
}));

import { createApp } from "../app";
import { InMemoryRepository } from "../repositories/inMemoryRepository";
import { resetAiCooldownMapsForTest } from "../routes/aiRoutes";

const bootstrap = async () => {
  resetAiCooldownMapsForTest();
  const repo = new InMemoryRepository();
  const app = createApp(repo);
  const signup = await request(app).post("/auth/signup").send({
    name: "Robin",
    username: "robin",
    password: "password123",
  });
  const token = signup.body.token as string;
  return { app, token };
};

describe("MVP backend routes", () => {
  it("supports auth and profile flow", async () => {
    const { app, token } = await bootstrap();
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("robin");
  });

  it("creates folders, notes, and lists directory items", async () => {
    const { app, token } = await bootstrap();
    const folder = await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Physics",
      directory: "1/",
    });
    expect(folder.status).toBe(201);

    const note = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture-01-01",
      directory: "1/Physics/",
      rawText: "Class covered vectors and acceleration.",
      language: "English",
      durationSeconds: 600,
    });
    expect(note.status).toBe(201);

    const list = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/Physics/" });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].type).toBe("note");
  });

  it("renames a folder and keeps nested notes under the new path", async () => {
    const { app, token } = await bootstrap();
    const folderRes = await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Physics",
      directory: "1/",
    });
    expect(folderRes.status).toBe(201);
    const folderId = folderRes.body.item.id as number;

    await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture-A",
      directory: "1/Physics/",
      rawText: "Intro material.",
      language: "English",
      durationSeconds: 60,
    });

    const rename = await request(app)
      .patch(`/items/${folderId}/rename`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newName: "PhysicsRenamed" });
    expect(rename.status).toBe(200);
    expect(rename.body.item.name).toBe("PhysicsRenamed");

    const after = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/PhysicsRenamed/" });
    expect(after.status).toBe(200);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].name).toBe("Lecture-A");

    const oldPath = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/Physics/" });
    expect(oldPath.status).toBe(200);
    expect(oldPath.body.items).toHaveLength(0);
  });

  it("lists subtree items when tree=true", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Physics",
      directory: "1/",
    });
    await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture-A",
      directory: "1/Physics/",
      rawText: "Intro.",
      language: "English",
      durationSeconds: 60,
    });

    const shallow = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/" });
    expect(shallow.status).toBe(200);
    expect(shallow.body.items).toHaveLength(1);
    expect(shallow.body.items[0].type).toBe("folder");

    const tree = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/", tree: "true" });
    expect(tree.status).toBe(200);
    expect(tree.body.items.length).toBeGreaterThanOrEqual(2);
    expect(tree.body.items.some((it: { type: string }) => it.type === "note")).toBe(true);
  });

  it("summarizes one note and generates selection summary", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Physics",
      directory: "1/",
    });
    const n1 = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture 1",
      directory: "1/Physics/",
      rawText: "Today we covered Newton's laws and examples.",
      language: "English",
      durationSeconds: 1200,
    });
    const n2 = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture 2",
      directory: "1/Physics/",
      rawText: "Momentum and collision examples were discussed.",
      language: "English",
      durationSeconds: 900,
    });

    const summarizeOne = await request(app)
      .post(`/ai/summarize/note/${n1.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(summarizeOne.status).toBe(200);
    expect(String(summarizeOne.body.note.aiSummary)).toContain("Summary:");

    const folderItems = await request(app)
      .get("/items")
      .set("Authorization", `Bearer ${token}`)
      .query({ directory: "1/" });
    const folderId = folderItems.body.items.find((i: { type: string }) => i.type === "folder")?.id;

    const summarizeSelection = await request(app)
      .post("/ai/summarize/selection")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [n2.body.note.id],
        folderIds: [folderId],
        outputDirectory: "1/Physics/",
        title: "Midterm Summary",
      });
    expect(summarizeSelection.status).toBe(201);
    expect(summarizeSelection.body.note.sourceType).toBe("generated_summary");
    expect(summarizeSelection.body.sourceCount).toBeGreaterThanOrEqual(2);
    expect(summarizeSelection.body.note.language).toBe("English");
  });

  it("selection summary inherits language when all sources share it", async () => {
    const { app, token } = await bootstrap();
    const a = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "A",
      directory: "1/",
      rawText: "Primera parte de la clase.",
      language: "Spanish",
      durationSeconds: 60,
    });
    const b = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "B",
      directory: "1/",
      rawText: "Segunda parte de la clase.",
      language: "Spanish",
      durationSeconds: 60,
    });
    const sel = await request(app)
      .post("/ai/summarize/selection")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [a.body.note.id, b.body.note.id],
        folderIds: [],
        outputDirectory: "1/",
        title: "Resumen",
      });
    expect(sel.status).toBe(201);
    expect(sel.body.note.language).toBe("Spanish");
  });

  it("selection summary defaults to English when selection has no recordings", async () => {
    const { app, token } = await bootstrap();
    const recording = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lec",
      directory: "1/",
      rawText: "Contenido en español.",
      language: "Spanish",
      durationSeconds: 60,
    });
    const first = await request(app)
      .post("/ai/summarize/selection")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [recording.body.note.id],
        folderIds: [],
        outputDirectory: "1/",
        title: "Resumen uno",
      });
    expect(first.status).toBe(201);
    expect(first.body.note.sourceType).toBe("generated_summary");
    expect(first.body.note.language).toBe("Spanish");

    const second = await request(app)
      .post("/ai/summarize/selection")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [first.body.note.id],
        folderIds: [],
        outputDirectory: "1/",
        title: "Meta summary",
      });
    expect(second.status).toBe(201);
    expect(second.body.note.language).toBe("English");
  });

  it("generates practice exam from selection and grades short answers", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Math",
      directory: "1/",
    });
    const noteRes = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture 1",
      directory: "1/Math/",
      rawText: "Primary colors include red, blue, and yellow. Two plus two equals four.",
      language: "English",
      durationSeconds: 600,
    });
    const noteId = noteRes.body.note.id as number;

    const gen = await request(app)
      .post("/ai/practice-exam/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [noteId],
        folderIds: [],
        outputDirectory: "1/",
        title: "Practice Quiz",
        questionCount: 2,
        includeMultipleChoice: true,
        includeShortAnswer: true,
        otherInstructions: "Keep it simple.",
      });
    expect(gen.status).toBe(201);
    expect(gen.body.note.sourceType).toBe("generated_practice_exam");
    const examNoteId = gen.body.note.id as number;
    const raw = JSON.parse(gen.body.note.rawText as string) as { questions: Array<{ type: string }> };
    expect(raw.questions).toHaveLength(2);
    const saIndex = raw.questions.findIndex((q) => q.type === "short_answer");
    expect(saIndex).toBeGreaterThanOrEqual(0);

    const grade = await request(app)
      .post("/ai/practice-exam/grade")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteId: examNoteId,
        responses: [{ questionIndex: saIndex, answer: "red" }],
      });
    expect(grade.status).toBe(200);
    expect(grade.body.results).toHaveLength(1);
    expect(grade.body.results[0].questionIndex).toBe(saIndex);
    expect(["correct", "partial", "incorrect"]).toContain(grade.body.results[0].verdict);
  });

  it("generates flashcards from selection", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Bio",
      directory: "1/",
    });
    const noteRes = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Cells",
      directory: "1/Bio/",
      rawText: "Mitochondria produce ATP. The nucleus holds DNA. Ribosomes synthesize proteins.",
      language: "English",
      durationSeconds: 60,
    });
    const noteId = noteRes.body.note.id as number;

    const gen = await request(app)
      .post("/ai/flashcards/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        noteIds: [noteId],
        folderIds: [],
        outputDirectory: "1/",
        title: "Bio key terms",
      });
    expect(gen.status).toBe(201);
    expect(gen.body.note.sourceType).toBe("generated_flashcards");
    const raw = JSON.parse(gen.body.note.rawText as string) as { version: number; cards: unknown[] };
    expect(raw.version).toBe(1);
    expect(Array.isArray(raw.cards)).toBe(true);
    expect(raw.cards.length).toBeGreaterThanOrEqual(1);
  });

  it("answers session Q&A from transcript (stub in test)", async () => {
    const { app, token } = await bootstrap();
    const transcript =
      "Professor Lee explains photosynthesis. Chlorophyll absorbs light. The midterm will cover chapter four only.";
    const qa = await request(app)
      .post("/ai/session-qa")
      .set("Authorization", `Bearer ${token}`)
      .send({
        transcript,
        question: "What will the midterm cover?",
        language: "English",
      });
    expect(qa.status).toBe(200);
    expect(typeof qa.body.answer).toBe("string");
    expect((qa.body.answer as string).length).toBeGreaterThan(0);
  });

  it("extracts jargon from a transcript chunk (stub in test)", async () => {
    const { app, token } = await bootstrap();
    const chunk =
      "The derivative measures rate of change. We define it using a limit as h approaches zero. The tangent line gives the slope at a point.";
    const jargon = await request(app)
      .post("/ai/jargon/extract")
      .set("Authorization", `Bearer ${token}`)
      .send({
        chunkText: chunk,
        alreadyFlagged: [],
      });
    expect(jargon.status).toBe(200);
    expect(Array.isArray(jargon.body.terms)).toBe(true);
    expect((jargon.body.terms as { term: string; definition: string }[]).length).toBeGreaterThanOrEqual(1);
    const terms = jargon.body.terms as { term: string; definition: string }[];
    expect(terms[0]).toHaveProperty("term");
    expect(terms[0]).toHaveProperty("definition");
  });

  it("returns 400 for empty jargon chunkText", async () => {
    const { app, token } = await bootstrap();
    const jargon = await request(app)
      .post("/ai/jargon/extract")
      .set("Authorization", `Bearer ${token}`)
      .send({ chunkText: "   ", alreadyFlagged: [] });
    expect(jargon.status).toBe(400);
  });

  it("rate-limits jargon extract with 429 within cooldown", async () => {
    const { app, token } = await bootstrap();
    const chunk =
      "The derivative is the limit of the difference quotient. The power rule says the derivative of x squared is two x.";
    const first = await request(app)
      .post("/ai/jargon/extract")
      .set("Authorization", `Bearer ${token}`)
      .send({ chunkText: chunk, alreadyFlagged: [] });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post("/ai/jargon/extract")
      .set("Authorization", `Bearer ${token}`)
      .send({ chunkText: chunk, alreadyFlagged: [] });
    expect(second.status).toBe(429);
  });

  it("moves a note into a folder", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Physics",
      directory: "1/",
    });
    const noteRes = await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Lecture",
      directory: "1/",
      rawText: "Hi",
      language: "English",
      durationSeconds: 1,
    });
    const noteItemId = noteRes.body.note.id as number;
    const move = await request(app)
      .patch(`/items/${noteItemId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/Physics/" });
    expect(move.status).toBe(200);
    expect(move.body.item.directory).toBe("1/Physics/");
  });

  it("moves a folder and updates paths of nested notes", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Outer",
      directory: "1/",
    });
    await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "N1",
      directory: "1/Outer/",
      rawText: "x",
      language: "English",
      durationSeconds: 1,
    });
    const listRoot = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" });
    const outerId = listRoot.body.items.find((i: { name: string }) => i.name === "Outer").id as number;
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Inbox",
      directory: "1/",
    });
    const listRoot2 = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" });
    const inboxId = listRoot2.body.items.find((i: { name: string }) => i.name === "Inbox").id as number;
    const move = await request(app)
      .patch(`/items/${outerId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/Inbox/" });
    expect(move.status).toBe(200);
    const insideInbox = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/Inbox/Outer/" });
    expect(insideInbox.status).toBe(200);
    expect(insideInbox.body.items.some((i: { name: string }) => i.name === "N1")).toBe(true);
    expect(inboxId).toBeDefined();
  });

  it("rejects move when a name already exists in the target folder", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Box",
      directory: "1/",
    });
    await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Dup",
      directory: "1/",
      rawText: "a",
      language: "English",
      durationSeconds: 1,
    });
    await request(app).post("/notes").set("Authorization", `Bearer ${token}`).send({
      title: "Dup",
      directory: "1/Box/",
      rawText: "b",
      language: "English",
      durationSeconds: 1,
    });
    const list = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" });
    const rootDupId = list.body.items.find((i: { name: string; type: string }) => i.name === "Dup" && i.type === "note").id;
    const move = await request(app)
      .patch(`/items/${rootDupId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/Box/" });
    expect(move.status).toBe(409);
  });

  it("rejects moving a folder into itself or its descendant", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "P",
      directory: "1/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "Q",
      directory: "1/P/",
    });
    const pId = (await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" })).body.items.find(
      (i: { name: string }) => i.name === "P",
    ).id;
    const bad = await request(app)
      .patch(`/items/${pId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/P/Q/" });
    expect(bad.status).toBe(400);
  });

  it("rejects creating a folder inside the innermost allowed folder", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "A",
      directory: "1/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "B",
      directory: "1/A/",
    });
    const deep = await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "C",
      directory: "1/A/B/",
    });
    expect(deep.status).toBe(400);
  });

  it("rejects moving a folder into the innermost folder", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "A",
      directory: "1/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "B",
      directory: "1/A/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "X",
      directory: "1/",
    });
    const rootItems = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" });
    const xId = rootItems.body.items.find((i: { name: string }) => i.name === "X").id as number;
    const move = await request(app)
      .patch(`/items/${xId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/A/B/" });
    expect(move.status).toBe(400);
  });

  it("rejects moving a folder tree that would create a third folder level", async () => {
    const { app, token } = await bootstrap();
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "M",
      directory: "1/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "S",
      directory: "1/M/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "A",
      directory: "1/",
    });
    await request(app).post("/folders").set("Authorization", `Bearer ${token}`).send({
      name: "B",
      directory: "1/A/",
    });
    const rootItems = await request(app).get("/items").set("Authorization", `Bearer ${token}`).query({ directory: "1/" });
    const mId = rootItems.body.items.find((i: { name: string }) => i.name === "M").id as number;
    const move = await request(app)
      .patch(`/items/${mId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetDirectory: "1/A/B/" });
    expect(move.status).toBe(400);
  });

  describe("POST /youtube/parse", () => {
    beforeEach(() => {
      vi.mocked(parseYoutubePipeline).mockResolvedValue({
        transcriptText: "Hello world from transcript.",
        summaryMarkdown: "## Summary\n\n- Point one",
        durationSeconds: 99,
        noteTitle: "Mock Parsed Title",
        youtubeSourceUrl: "https://www.youtube.com/watch?v=abcd1234567",
      });
    });

    it("creates a summarized recording note with youtubeSourceUrl", async () => {
      const { app, token } = await bootstrap();
      const res = await request(app)
        .post("/youtube/parse")
        .set("Authorization", `Bearer ${token}`)
        .send({
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          directory: "1/",
          language: "English",
        });
      expect(res.status).toBe(201);
      expect(res.body.note.title).toBe("Mock Parsed Title");
      expect(res.body.note.aiSummary).toContain("Point one");
      expect(res.body.note.durationSeconds).toBe(99);
      expect(res.body.note.youtubeSourceUrl).toBe("https://www.youtube.com/watch?v=abcd1234567");
      expect(res.body.note.sourceType).toBe("recording");
      expect(res.body.note.rawText).toContain("Transcript:");
      expect(res.body.note.rawText).toContain("Hello world from transcript.");
    });

    it("rejects invalid YouTube URLs", async () => {
      const { app, token } = await bootstrap();
      const res = await request(app)
        .post("/youtube/parse")
        .set("Authorization", `Bearer ${token}`)
        .send({
          youtubeUrl: "https://example.com/video",
          directory: "1/",
        });
      expect(res.status).toBe(400);
    });

    it("rejects directories outside the user tree", async () => {
      const { app, token } = await bootstrap();
      const res = await request(app)
        .post("/youtube/parse")
        .set("Authorization", `Bearer ${token}`)
        .send({
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          directory: "2/",
        });
      expect(res.status).toBe(400);
    });

    it("maps pipeline failures to HTTP errors", async () => {
      vi.mocked(parseYoutubePipeline).mockRejectedValueOnce(
        new HttpClientError("Could not access the video. Make sure the link is public and try again.", 502),
      );
      const { app, token } = await bootstrap();
      const res = await request(app)
        .post("/youtube/parse")
        .set("Authorization", `Bearer ${token}`)
        .send({
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          directory: "1/",
        });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain("Could not access");
    });
  });
});
