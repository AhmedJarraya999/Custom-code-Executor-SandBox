import Redis from "ioredis";
import { exec } from "child_process";
import { promisify } from "util";

const redis = new Redis();
const execAsync = promisify(exec);

async function processJob(job) {
  const { id, source_code, language_id } = job;

  try {
    // Example: run Python code (language_id:71 is python3 in Judge0)
    if (language_id === 71) {
      const filename = `/tmp/${id}.py`;
      await execAsync(`echo "${source_code}" > ${filename}`);
      const { stdout, stderr } = await execAsync(`docker run --rm -v /tmp:/tmp python:3.9 python ${filename}`);
      
      // Save result
      await redis.hset(`submission:${id}`, {
        status: "Completed",
        stdout,
        stderr
      });
    } else {
      await redis.hset(`submission:${id}`, {
        status: "Error",
        stderr: "Language not supported yet"
      });
    }
  } catch (err) {
    await redis.hset(`submission:${id}`, {
      status: "Error",
      stderr: err.message
    });
  }
}

async function run() {
  while (true) {
    const jobData = await redis.brpop("queue:submissions", 0); // blocking pop
    const job = JSON.parse(jobData[1]);
    await redis.hset(`submission:${job.id}`, "status", "Running");
    await processJob(job);
  }
}

run();
