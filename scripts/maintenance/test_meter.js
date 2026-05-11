require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkHimalaya() {
    console.log('Querying nodes for HIMALAYA...');
    const snapshot = await db.collection('nodes').where('name', '>=', 'HIMALAYA').limit(5).get();
    
    if (snapshot.empty) {
        console.log('No HIMALAYA nodes found in nodes collection.');
        
        // Let's check other common collections
        const s2 = await db.collection('evarameters').limit(5).get();
        if (!s2.empty) {
            console.log('Found evarameters:', s2.docs.map(d => ({id: d.id, ...d.data()})));
        } else {
            console.log('evarameters collection is transparently empty.');
        }
        return;
    }

    snapshot.forEach(doc => {
        console.log(`\nNode ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });
}

checkHimalaya().then(() => process.exit(0)).catch(console.error);
