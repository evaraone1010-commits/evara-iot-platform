require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function testQuery() {
    let query = db.collection("devices");
    
    // Simulate superadmin getNodes query
    query = query.orderBy('created_at', 'desc').limit(100);
    
    const snapshot = await query.get();
    console.log(`Found ${snapshot.size} devices`);
    
    let foundKrbSump = false;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (doc.id === '182Pv0i9nrYKzGoLhrXY' || data.device_id === 'EV-TNK-004') {
            foundKrbSump = true;
            console.log("Found KRB Sump in query results!");
            console.log("created_at value:", data.created_at);
        }
    }
    
    if (!foundKrbSump) {
        console.log("KRB Sump was NOT in the first 100 devices ordered by created_at desc!");
    }
}

testQuery().then(() => process.exit(0)).catch(console.error);
