require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function dumpDevices() {
    console.log("Dumping all devices...");
    const snapshot = await db.collection("devices").get();
    
    for (const doc of snapshot.docs) {
        console.log(`Device ID: ${doc.id}`);
        console.log(doc.data());
        console.log("-------------------");
    }
}

dumpDevices().then(() => process.exit(0)).catch(console.error);
