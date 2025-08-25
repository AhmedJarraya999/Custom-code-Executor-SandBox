// api/src/index.js
import express from "express";
import { v4 as uuid } from "uuid";
import Redis from "ioredis";

const app = express();
app.use(express.json());
const redis = new Redis(); // default localhost:6379

app.post("/submissions", async (req, res) => {
  const id = uuid();
  const job = { id, ...req.body, status: "InQueue" };
  await redis.lpush("queue:submissions", JSON.stringify(job));
  // also store initial status
  await redis.hset(`submission:${id}`, "status", "InQueue");
  res.json({ id });
});

app.get("/submissions/:id", async (req, res) => {
  const id = req.params.id;
  const result = await redis.hgetall(`submission:${id}`);
  if (!result || !result.status) return res.status(404).json({ error: "Not found" });
  res.json(result);
});

app.listen(3000, () => console.log("API listening on 3000"));
