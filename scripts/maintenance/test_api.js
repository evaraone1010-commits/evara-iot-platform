const { getNodeAnalytics } = require("./src/controllers/nodes.controller.js");

async function testAnalytics() {
    const req = {
        params: { id: "UxSim3VQh2qI232wDgHo" },
        user: { role: "superadmin" } // bypass auth checks for test
    };
    
    const res = {
        status: (code) => {
            return {
                json: (data) => console.log("Status:", code, "JSON:", JSON.stringify(data).substring(0, 500) + "...")
            };
        }
    };
    
    await getNodeAnalytics(req, res);
}
testAnalytics().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
