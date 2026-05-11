#!/usr/bin/env node

const { execFileSync } = require("child_process");

const patterns = [
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN (RSA |EC )?PRIVATE KEY-----",
  '"private_key":\\s*"-----BEGIN',
  "JWT_SECRET\\s*=\\s*.+",
  "ENCRYPTION_KEY\\s*=\\s*.+",
  "FIREBASE_PRIVATE_KEY\\s*=\\s*-----BEGIN"
];

function runGitSecrets(args) {
  execFileSync("git", ["secrets", ...args], { stdio: "inherit" });
}

function main() {
  try {
    runGitSecrets(["--install"]);
    runGitSecrets(["--register-aws"]);

    for (const pattern of patterns) {
      runGitSecrets(["--add", pattern]);
    }

    console.log("git-secrets installed and patterns registered.");
    console.log("Next step: commit through Husky, which will run git secrets --scan --cached.");
  } catch (error) {
    console.error("Failed to configure git-secrets.");
    console.error("Install it first, then rerun:");
    console.error("  git secrets --install");
    console.error("  git secrets --register-aws");
    process.exit(error?.status || 1);
  }
}

main();