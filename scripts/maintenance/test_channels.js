const axios = require("axios");
async function test() {
    for (let id = 2613740; id <= 2613750; id++) {
        try {
            const res = await axios.get(`https://api.thingspeak.com/channels/${id}/feeds.json?results=1`, {timeout: 3000});
            console.log(`Channel ${id}:`, res.data.channel.name);
        } catch(e) {
            console.log(`Channel ${id}: access denied or not found`);
        }
    }
}
test();
