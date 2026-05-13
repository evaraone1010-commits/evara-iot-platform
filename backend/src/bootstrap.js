require('dotenv').config(); // FIRST - load env vars

const { loadRuntimeSecrets } = require("./config/runtimeSecrets.js");

async function main() {
    try {
        await loadRuntimeSecrets(); // SECOND - load secrets
    } catch (error) {
        console.error("[Bootstrap] Failed to load runtime secrets:", error.message, error.stack);
        process.exit(1);
    }

    // THIRD - only now load server (which loads Firebase)
    const serverModule = require("./server.js");
    if (typeof serverModule.startServer === "function") {
        await serverModule.startServer();
    }
}

main().catch((error) => {
    console.error("[Bootstrap] Unhandled startup error:", error.message, "\nStack:", error.stack);
    process.exit(1);
});