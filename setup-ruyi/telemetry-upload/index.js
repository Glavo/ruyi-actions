const fs = require("fs");
const { spawnSync } = require("child_process");

function appendState(name, value) {
  const stateFile = process.env.GITHUB_STATE;
  if (!stateFile) {
    throw new Error("GITHUB_STATE is not set");
  }
  fs.appendFileSync(stateFile, `${name}=${value}\n`, { encoding: "utf8" });
}

function main() {
  const ruyiBin = process.env["INPUT_RUYI-BIN"] || process.env.INPUT_RUYI_BIN;
  if (!ruyiBin) {
    throw new Error("input ruyi-bin is required");
  }

  appendState("registered", "true");
  appendState("ruyi_bin", ruyiBin);
  console.log("Registered post-run Ruyi telemetry upload.");
}

function post() {
  if (process.env.STATE_registered !== "true") {
    return;
  }

  const ruyiBin = process.env.STATE_ruyi_bin;
  if (!ruyiBin) {
    console.warn("Ruyi telemetry upload skipped: missing ruyi executable path.");
    return;
  }

  const result = spawnSync(ruyiBin, ["telemetry", "upload"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.warn(`Ruyi telemetry upload failed: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    console.warn(`Ruyi telemetry upload exited with status ${result.status}.`);
  }
}

if (process.env.STATE_registered === "true") {
  post();
} else {
  main();
}
