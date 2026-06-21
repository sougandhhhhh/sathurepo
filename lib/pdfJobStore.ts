import path from "node:path";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const JOB_ROOT = path.join(tmpdir(), "sathuuty-pdf-jobs");

function assertJobId(jobId: string) {
  if (!/^[a-f0-9-]{8,}$/i.test(jobId)) {
    throw new Error("Invalid job id");
  }
}

export function getJobDir(jobId: string) {
  assertJobId(jobId);
  return path.join(JOB_ROOT, jobId);
}

export async function ensureJobPartDir(jobId: string) {
  const dir = path.join(getJobDir(jobId), "parts");
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writePdfPart(jobId: string, partIndex: number, bytes: Uint8Array) {
  if (!Number.isInteger(partIndex) || partIndex < 1) {
    throw new Error("Invalid part index");
  }

  const partDir = await ensureJobPartDir(jobId);
  const name = `part-${String(partIndex).padStart(4, "0")}.pdf`;
  await writeFile(path.join(partDir, name), bytes);
}

export async function listPdfParts(jobId: string) {
  const partDir = path.join(getJobDir(jobId), "parts");
  const entries = await readdir(partDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(partDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function cleanupJob(jobId: string) {
  await rm(getJobDir(jobId), { recursive: true, force: true });
}
