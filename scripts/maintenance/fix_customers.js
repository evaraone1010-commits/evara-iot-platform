require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function fixCustomers() {
    console.log("Fixing customer zone mappings...");
    const snapshot = await db.collection("customers").get();
    let count = 0;
    
    const batch = db.batch();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.regionFilter && !data.zone_id) {
            batch.update(doc.ref, { 
                zone_id: data.regionFilter 
            });
            count++;
            console.log(`Will update customer: ${data.display_name || doc.id} to zone: ${data.regionFilter}`);
        }
    }
    
    if (count > 0) {
        await batch.commit();
        console.log(`Successfully fixed ${count} customers.`);
    } else {
        console.log("No customers needed fixing.");
    }
}

fixCustomers().then(() => process.exit(0)).catch(console.error);
