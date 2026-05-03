import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { InMemoryRepository } from "../repositories/inMemoryRepository";

const bootstrap = async () => {
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
});
