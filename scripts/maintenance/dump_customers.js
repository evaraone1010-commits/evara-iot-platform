require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function dumpCustomers() {
    console.log("Dumping all customers...");
    const snapshot = await db.collection("customers").get();
    
    for (const doc of snapshot.docs) {
        console.log(`Customer ID: ${doc.id}`);
        console.log(doc.data());
        console.log("-------------------");
    }
}

dumpCustomers().then(() => process.exit(0)).catch(console.error);
