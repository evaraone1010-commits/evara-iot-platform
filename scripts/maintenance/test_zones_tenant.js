require("dotenv").config({ path: ".env" });
const { db } = require("./src/config/firebase");

async function run() {
    const snapshot = await db.collection("zones").get();
    const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(JSON.stringify(zones, null, 2));
}

run().catch(console.error);
