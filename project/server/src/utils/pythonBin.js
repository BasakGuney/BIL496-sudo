import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function isRunnablePython(candidate) {
  if (!candidate) return false;

  try {
    const result = spawnSync(candidate, ["--version"], {
      stdio: "ignore",
      shell: false,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

export function resolvePythonBin({ cwd = process.cwd() } = {}) {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const localCandidates = [
    path.resolve(cwd, ".venv-analysis", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
    path.resolve(cwd, "src/services/analysis/python_api/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
  ].filter((candidate) => existsSync(candidate));

  for (const candidate of localCandidates) {
    if (isRunnablePython(candidate)) return candidate;
  }

  for (const candidate of ["python3.12", "python3.11", "python3", "python"]) {
    if (isRunnablePython(candidate)) return candidate;
  }

  return process.env.PYTHON_BIN || "python3";
}
