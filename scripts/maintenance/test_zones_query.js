require("dotenv").config();
const { db } = require('./src/config/firebase.js');

async function test() {
  const limitStr = 50;
  let query = db.collection("zones").orderBy("created_at").limit(limitStr);
  const snapshot = await query.get();
  const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Query orderBy("created_at") returned ${zones.length} zones:`);
  zones.forEach(z => console.log(z.zoneName));

  let query2 = db.collection("zones").limit(limitStr);
  const snapshot2 = await query2.get();
  const zones2 = snapshot2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`\nQuery without orderBy returned ${zones2.length} zones:`);
  zones2.forEach(z => console.log(z.zoneName));
}

test().catch(console.error);
