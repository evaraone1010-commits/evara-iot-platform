const NodeCache = require("node-cache");

const telemetryCache = new NodeCache({
  stdTTL: 10
});

module.exports = telemetryCache;
