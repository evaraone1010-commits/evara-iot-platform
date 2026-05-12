require("dotenv").config();
const { db } = require('./src/config/firebase.js');

async function test() {
  const custSnap = await db.collection("customers").get();
  console.log("\nTotal customers:", custSnap.size);
  custSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Customer ${doc.id}: ${data.full_name || data.display_name}, role: ${data.role}`);
  });
}

test().catch(console.error);
