
const deviceState = {
    calculateDeviceStatus: (ts) => "ONLINE"
};

const getLatestFeed = (feeds) => feeds[feeds.length - 1];

const normalizeThingSpeakTimestamp = (ts) => ts + "Z";

function testFix() {
    const type = "flow_meter";
    const feeds = [{ created_at: "2026-03-25T22:00:00", field3: "10.5", field1: "1000.0" }];
    const fieldMapping = {};
    const metadata = {};
    const deviceDocData = { flow_rate_field: "field3", meter_reading_field: "field1" };
    const deviceDoc = { data: () => deviceDocData, id: "HIMALAYA_DEVICE" };
    const req = { params: { id: "HIMALAYA" } };

    // Simulating the fixed block
    if (["evaraflow", "flow", "flow_meter"].includes(type)) {
        const flowRateFieldKey = 
            deviceDoc.data().flow_rate_field || deviceDoc.data().flowField || 
            fieldMapping.flowField || fieldMapping.flow_rate_field || 
            metadata.flow_rate_field || metadata.flowField ||
            (feeds[feeds.length-1]?.field4 !== undefined ? "field4" : "field3");

        const totalReadingFieldKey = 
            deviceDoc.data().meter_reading_field || deviceDoc.data().volumeField || 
            fieldMapping.volumeField || fieldMapping.meter_reading_field || 
            metadata.meter_reading_field || metadata.volumeField ||
            (feeds[feeds.length-1]?.field5 !== undefined ? "field5" : "field1");

        if (feeds.length > 0) {
            const latestFeed = getLatestFeed(feeds);
            const lastUpdatedAt = latestFeed.created_at;
            const status = deviceState.calculateDeviceStatus(lastUpdatedAt);
            
            const flowResult = { 
                node_id: req.params.id, 
                status,
                lastUpdatedAt,
                flow_rate: parseFloat(latestFeed[flowRateFieldKey]) || 0,
                total_liters: parseFloat(latestFeed[totalReadingFieldKey]) || 0,
                history: feeds.map(f => ({
                    timestamp: normalizeThingSpeakTimestamp(f.created_at),
                    flow_rate: parseFloat(f[flowRateFieldKey]) || 0,
                    total_reading: parseFloat(f[totalReadingFieldKey]) || 0
                }))
            };

            console.log("Success! flowResult:", JSON.stringify(flowResult, null, 2));
            if (flowResult.lastUpdatedAt === "2026-03-25T22:00:00" && flowResult.flow_rate === 10.5) {
                console.log("Test Passed!");
            } else {
                console.error("Test Failed!");
                process.exit(1);
            }
        }
    }
}

testFix();
