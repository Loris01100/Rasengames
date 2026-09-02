export type PairVote = "good" | "easy" | "far";

export interface PairFeedbackRecord {
  id: string;
  category: string;
  a: string;
  b: string;
  hintA: string;
  hintB: string;
  good: number;
  easy: number;
  far: number;
  total: number;
  updatedAt: number;
}

export class UndercoverFeedback {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/vote") {
      const body = await request.json<Record<string, unknown>>();
      const vote = String(body.vote ?? "") as PairVote;
      if (!(["good", "easy", "far"] as string[]).includes(vote)) {
        return new Response("Vote invalide", { status: 400 });
      }
      const id = String(body.id ?? "").slice(0, 180);
      if (!id) return new Response("Paire invalide", { status: 400 });
      const previous = await this.state.storage.get<PairFeedbackRecord>(`pair:${id}`);
      const record: PairFeedbackRecord = previous ?? {
        id,
        category: String(body.category ?? ""),
        a: String(body.a ?? "").slice(0, 80),
        b: String(body.b ?? "").slice(0, 80),
        hintA: String(body.hintA ?? "").slice(0, 80),
        hintB: String(body.hintB ?? "").slice(0, 80),
        good: 0,
        easy: 0,
        far: 0,
        total: 0,
        updatedAt: 0,
      };
      record[vote] += 1;
      record.total += 1;
      record.updatedAt = Date.now();
      await this.state.storage.put(`pair:${id}`, record);
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/results") {
      const entries = await this.state.storage.list<PairFeedbackRecord>({ prefix: "pair:" });
      const results = [...entries.values()].sort((a, b) => b.total - a.total || a.a.localeCompare(b.a));
      return Response.json({ results });
    }
    return new Response("Not found", { status: 404 });
  }
}
