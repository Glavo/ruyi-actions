const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let actionsCache;

async function getActionsCache() {
  if (!actionsCache) {
    actionsCache = await import("@actions/cache");
  }
  return actionsCache;
}

function getInput(name, defaultValue = "") {
  const envName = `INPUT_${name.toUpperCase().replace(/ /g, "_")}`;
  return process.env[envName] ?? defaultValue;
}

function appendFileFromEnv(envName, content) {
  const file = process.env[envName];
  if (!file) {
    return;
  }
  fs.appendFileSync(file, content, { encoding: "utf8" });
}

function exportPath(value) {
  appendFileFromEnv("GITHUB_PATH", `${value}${os.EOL}`);
}

function exportEnv(name, value) {
  appendFileFromEnv("GITHUB_ENV", `${name}=${value}${os.EOL}`);
}

function setOutput(name, value) {
  appendFileFromEnv("GITHUB_OUTPUT", `${name}=${value}${os.EOL}`);
}

function saveState(name, value) {
  appendFileFromEnv("GITHUB_STATE", `${name}=${value}${os.EOL}`);
}

function getBooleanInput(name, defaultValue) {
  const value = getInput(name, defaultValue).trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function getRunnerOS() {
  return process.env.RUNNER_OS || (process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux");
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function findPython() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push(process.env.PYTHON);
  }
  candidates.push("python");
  if (process.platform !== "win32") {
    candidates.push("python3");
  }

  for (const candidate of candidates) {
    try {
      capture(candidate, ["-c", "import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)"]);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Python 3 is not available on PATH. Run actions/setup-python before setup-ruyi.");
}

function splitArgs(value) {
  const args = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("pip-extra-args contains an unterminated quote");
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function pathFromHome(...segments) {
  return path.join(os.homedir(), ...segments);
}

function getRuyiRoots() {
  const configHome = process.env.XDG_CONFIG_HOME || pathFromHome(".config");
  const cacheHome = process.env.XDG_CACHE_HOME || pathFromHome(".cache");
  const dataHome = process.env.XDG_DATA_HOME || pathFromHome(".local", "share");
  const stateHome = process.env.XDG_STATE_HOME || pathFromHome(".local", "state");

  return {
    configRoot: path.join(configHome, "ruyi"),
    cacheRoot: path.join(cacheHome, "ruyi"),
    dataRoot: path.join(dataHome, "ruyi"),
    stateRoot: path.join(stateHome, "ruyi"),
  };
}

function getInstallRoot(version) {
  const base = process.env.RUNNER_TOOL_CACHE || pathFromHome(".cache", "actions");
  return path.join(base, "ruyi-python", version || "latest");
}

function getVenvPaths(installRoot) {
  if (getRunnerOS() === "Windows") {
    return {
      pythonBin: path.join(installRoot, "Scripts", "python.exe"),
      ruyiBin: path.join(installRoot, "Scripts", "ruyi.exe"),
      binDir: path.join(installRoot, "Scripts"),
    };
  }
  return {
    pythonBin: path.join(installRoot, "bin", "python"),
    ruyiBin: path.join(installRoot, "bin", "ruyi"),
    binDir: path.join(installRoot, "bin"),
  };
}

async function restoreRuyiCache(enabled, version, cacheVersion, roots) {
  const key = `${getRunnerOS()}-ruyi-${version}-${cacheVersion}`;
  const restoreKeys = [`${getRunnerOS()}-ruyi-${version}-`, `${getRunnerOS()}-ruyi-`];
  const paths = [roots.cacheRoot, roots.dataRoot, roots.stateRoot];

  if (!enabled) {
    return { key, paths, hit: false };
  }

  const cache = await getActionsCache();
  if (!cache.isFeatureAvailable()) {
    console.warn("GitHub cache service is not available.");
    return { key, paths, hit: false };
  }

  try {
    const matchedKey = await cache.restoreCache(paths, key, restoreKeys);
    if (matchedKey) {
      console.log(`Restored Ruyi cache from key: ${matchedKey}`);
    } else {
      console.log("No Ruyi cache entry found.");
    }
    return { key, paths, hit: matchedKey === key };
  } catch (error) {
    console.warn(`Ruyi cache restore failed: ${error.message}`);
    return { key, paths, hit: false };
  }
}

async function saveRuyiCache() {
  if (process.env.STATE_cache_enabled !== "true") {
    return;
  }
  if (process.env.STATE_cache_hit === "true") {
    console.log("Skipping Ruyi cache save because the primary key was already restored.");
    return;
  }
  const cache = await getActionsCache();
  if (!cache.isFeatureAvailable()) {
    console.warn("GitHub cache service is not available.");
    return;
  }

  const key = process.env.STATE_cache_key;
  const paths = JSON.parse(process.env.STATE_cache_paths || "[]");
  if (!key || paths.length === 0) {
    return;
  }

  try {
    const cacheId = await cache.saveCache(paths, key);
    console.log(`Saved Ruyi cache with id: ${cacheId}`);
  } catch (error) {
    console.warn(`Ruyi cache save failed: ${error.message}`);
  }
}

function configureTelemetry(telemetry, ruyiBin) {
  if (telemetry === "off") {
    process.env.RUYI_TELEMETRY_OPTOUT = "1";
    exportEnv("RUYI_TELEMETRY_OPTOUT", "1");
  } else if (telemetry === "on") {
    run(ruyiBin, ["telemetry", "consent"]);
    saveState("telemetry", "on");
    saveState("ruyi_bin", ruyiBin);
  } else {
    run(ruyiBin, ["config", "set", "telemetry.mode", telemetry]);
  }
}

async function main() {
  saveState("registered", "true");

  const setupPython = getBooleanInput("setup-python", "false");
  const version = getInput("version");
  const installSpecInput = getInput("install-spec");
  const pipExtraArgs = splitArgs(getInput("pip-extra-args"));
  const cacheEnabled = getBooleanInput("cache", "true");
  const cacheVersion = getInput("cache-version", "v1");
  const update = getBooleanInput("update", "true");
  const repoRemote = getInput("repo-remote");
  const repoBranch = getInput("repo-branch");
  const repoLocal = getInput("repo-local");
  const extraConfig = getInput("extra-config");
  const telemetry = getInput("telemetry", "on").trim();

  if (!["off", "local", "on"].includes(telemetry)) {
    throw new Error("telemetry must be one of: off, local, on");
  }

  if (setupPython) {
    console.warn("setup-python is a compatibility input. This action uses Python from PATH; run actions/setup-python before setup-ruyi when a specific version is required.");
  }

  const roots = getRuyiRoots();
  for (const root of Object.values(roots)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const cacheInfo = await restoreRuyiCache(cacheEnabled, version, cacheVersion, roots);

  const python = findPython();
  const installRoot = getInstallRoot(version);
  fs.mkdirSync(path.dirname(installRoot), { recursive: true });
  run(python, ["-m", "venv", installRoot]);

  const { pythonBin, ruyiBin, binDir } = getVenvPaths(installRoot);
  run(pythonBin, ["-m", "pip", "install", "--upgrade", "pip"]);

  let installSpec = "ruyi";
  if (installSpecInput) {
    installSpec = installSpecInput;
  } else if (version) {
    installSpec = `ruyi==${version}`;
  }

  run(pythonBin, ["-m", "pip", "install", "--upgrade", ...pipExtraArgs, installSpec]);
  exportPath(binDir);

  configureTelemetry(telemetry, ruyiBin);

  if (repoRemote) {
    run(ruyiBin, ["config", "set", "repo.remote", repoRemote]);
  }
  if (repoBranch) {
    run(ruyiBin, ["config", "set", "repo.branch", repoBranch]);
  }
  if (repoLocal) {
    run(ruyiBin, ["config", "set", "repo.local", repoLocal]);
  }
  if (extraConfig) {
    fs.appendFileSync(path.join(roots.configRoot, "config.toml"), `${os.EOL}${extraConfig}${os.EOL}`, { encoding: "utf8" });
  }
  if (update) {
    run(ruyiBin, ["update"]);
  }

  const installedVersion = capture(pythonBin, ["-c", "from ruyi.version import RUYI_SEMVER; print(RUYI_SEMVER)"]);
  setOutput("ruyi-bin", ruyiBin);
  setOutput("ruyi-version", installedVersion);
  setOutput("python-venv", installRoot);
  setOutput("config-root", roots.configRoot);
  setOutput("cache-root", roots.cacheRoot);
  setOutput("data-root", roots.dataRoot);
  setOutput("state-root", roots.stateRoot);

  saveState("cache_enabled", String(cacheEnabled));
  saveState("cache_hit", String(cacheInfo.hit));
  saveState("cache_key", cacheInfo.key);
  saveState("cache_paths", JSON.stringify(cacheInfo.paths));
}

async function post() {
  if (process.env.STATE_telemetry === "on") {
    const ruyiBin = process.env.STATE_ruyi_bin;
    if (!ruyiBin) {
      console.warn("Ruyi telemetry upload skipped: missing ruyi executable path.");
    } else {
      console.log(`> ${ruyiBin} telemetry upload`);
      const result = spawnSync(ruyiBin, ["telemetry", "upload"], {
        stdio: "inherit",
        env: process.env,
      });
      if (result.error) {
        console.warn(`Ruyi telemetry upload failed: ${result.error.message}`);
      } else if (result.status !== 0) {
        console.warn(`Ruyi telemetry upload exited with status ${result.status}.`);
      }
    }
  }

  await saveRuyiCache();
}

const isPost = process.env.STATE_registered === "true";
(isPost ? post() : main()).catch((error) => {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
});
