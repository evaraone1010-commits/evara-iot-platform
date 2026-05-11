require('dotenv').config();

const { loadRuntimeSecrets } = require("./config/runtimeSecrets.js");

async function main() {
    try {
        await loadRuntimeSecrets();
    } catch (error) {
        console.error("[Bootstrap] Failed to load runtime secrets:", error.message);
        process.exit(1);
    }

    const serverModule = require("./server.js");
    if (typeof serverModule.startServer === "function") {
        await serverModule.startServer();
    }
}

main().catch((error) => {
    console.error("[Bootstrap] Unhandled startup error:", error.message, "\nStack:", error.stack);
    process.exit(1);
});