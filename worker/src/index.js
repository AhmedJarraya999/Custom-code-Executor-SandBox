import Redis from "ioredis";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const redis = new Redis();
const execAsync = promisify(exec);

// Map language_id to Docker image, command, and file extension
const languageMap = {
  71: { image: "python-sandbox:latest", cmd: "python", ext: "py", dockerfile: "./dockerfiles/python" },
  62: { image: "java-sandbox:latest", cmd: "java", ext: "java", dockerfile: "./dockerfiles/java" },
  63: { image: "cpp-sandbox:latest", cmd: "g++", ext: "cpp", dockerfile: "./dockerfiles/cpp" }
};

async function acquireLock(key, timeout = 10000) {
  const lockKey = `lock:${key}`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // NX = only set if not exists, PX = expiration in ms
    const result = await redis.set(lockKey, "locked", "NX", "PX", timeout);
    if (result === "OK") return true; // lock acquired
    await new Promise(r => setTimeout(r, 100)); // wait 100ms before retry
  }

  throw new Error(`Failed to acquire lock for ${key}`);
}

async function releaseLock(key) {
  const lockKey = `lock:${key}`;
  await redis.del(lockKey);
}


// Build Docker image if it doesn't exist
async function ensureImage(lang) {
  try {
    await execAsync(`docker image inspect ${lang.image}`);
    console.log(`${lang.image} exists`);
  } catch {
    console.log(`${lang.image} not found. Building...`);
    await execAsync(`docker build -t ${lang.image} ${lang.dockerfile}`);
    console.log(`${lang.image} built successfully`);
  }
}

async function processJob(job) {
  const { id, source_code, language_id } = job;
  const lang = languageMap[language_id];

  if (!lang) {
    await redis.hset(`submission:${id}`, {
      status: "Error",
      stderr: "Language not supported yet"
    });
    return;
  }

  async function ensureImageWithLock(lang) {
  const lockKey = `docker-build:${lang.image}`;
  let lockAcquired = false;

  try {
    // Try to acquire lock before building
    lockAcquired = await acquireLock(lockKey, 30000); // 30s timeout
    await ensureImage(lang); // build only if not exists
  } finally {
    if (lockAcquired) {
      await releaseLock(lockKey);
    }
  }
}

  // Ensure Docker image exists
// Instead of directly calling ensureImage(lang)
  await ensureImageWithLock(lang);

  // Create temp file for the submission
  const filename = path.join("/tmp", `${id}.${lang.ext}`);
  fs.writeFileSync(filename, source_code);

  let compiledFile;
  try {
    let dockerCmd;

    if (language_id === 63) {
      // C++ requires compilation
      compiledFile = `/tmp/${id}_out`;
      dockerCmd = `
        docker run --rm -v /tmp:/tmp --network none --memory=128m --cpus=0.5 ${lang.image} \
        sh -c "g++ /tmp/${id}.cpp -o ${compiledFile} && timeout 5s ${compiledFile}"
      `;
    } else if (language_id === 62) {
      // Java requires compilation
      dockerCmd = `
        docker run --rm -v /tmp:/tmp --network none --memory=128m --cpus=0.5 ${lang.image} \
        sh -c "javac /tmp/${id}.java && timeout 5s java -cp /tmp ${id}"
      `;
    } else {
      // Python or interpreted languages
      dockerCmd = `
        docker run --rm -v /tmp:/tmp --network none --memory=128m --cpus=0.5 ${lang.image} \
        timeout 5s ${lang.cmd} /tmp/${id}.${lang.ext}
      `;
    }

    const { stdout, stderr } = await execAsync(dockerCmd);

    // Save result in Redis
    await redis.hset(`submission:${id}`, {
      status: "Completed",
      stdout,
      stderr
    });

  } catch (err) {
    await redis.hset(`submission:${id}`, {
      status: "Error",
      stderr: err.message
    });
  } finally {
    // Cleanup temp file and compiled binaries
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
    if (compiledFile && fs.existsSync(compiledFile)) fs.unlinkSync(compiledFile);
    if (language_id === 62) {
      const classFile = filename.replace(".java", ".class");
      if (fs.existsSync(classFile)) fs.unlinkSync(classFile);
    }
  }
}

async function runWorker() {
  while (true) {
    const jobData = await redis.brpop("queue:submissions", 0); // blocking pop
    const job = JSON.parse(jobData[1]);
    await redis.hset(`submission:${job.id}`, "status", "Running");
    await processJob(job);
  }
}

// Run multiple workers concurrently
const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "2");
for (let i = 0; i < concurrency; i++) {
  runWorker();
}
