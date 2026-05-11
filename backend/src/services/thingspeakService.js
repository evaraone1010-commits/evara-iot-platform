const axios = require("axios");

const fetchSixHourData = async (channelId, apiKey) => {
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=300`;
  const res = await axios.get(url, { timeout: 10000 });
  const feeds = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
  
  if (feeds.length === 0) return [];
  
  // Return all feeds — no time-based filter so we keep >= 200 for analysis
  // Only filter out entries with no timestamp
  return feeds.filter(feed => {
    const timestamp = new Date(feed.created_at);
    return !isNaN(timestamp.getTime());
  });
};

const fetchLatestData = async (channelId, apiKey, lastTimestamp) => {
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
  const res = await axios.get(url, { timeout: 8000 });
  const feeds = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
  
  if (!feeds || feeds.length === 0) return null;
  
  const latestFeed = feeds[0];
  const feedTimestamp = latestFeed.created_at;
  
  if (lastTimestamp && feedTimestamp <= lastTimestamp) return null;
  
  // Return the whole feed so the caller can handle field mapping
  return {
    timestamp: feedTimestamp,
    ...latestFeed
  };
};

const applyLightSmoothing = (data) => {
  if (!data || data.length < 3) return data;
  
  return data.map((point, index) => {
    if (index === 0 || index === data.length - 1) return point;
    
    const prev = data[index - 1];
    const curr = point;
    const next = data[index + 1];
    
    const avgValue = (prev.value + curr.value + next.value) / 3;
    
    return {
      ...curr,
      value: curr.value,
      smoothedValue: Number(avgValue.toFixed(2))
    };
  });
};

const calculateMetrics = (data, tankHeight = 1.2, tankDiameter = 1.0) => {
  if (!data || data.length === 0) {
    return {
      currentLevel: null,
      volume: null,
      fillRate: null,
      consumption: null,
      status: 'OFFLINE'
    };
  }
  
  const latestPoint = data[data.length - 1];
  const latestFeedTime = latestPoint.timestamp;
  const distance = latestPoint.value / 100;
  const waterLevel = Math.max(0, tankHeight - distance);
  const percentage = Math.min(100, (waterLevel / tankHeight) * 100);
  
  const tankRadius = tankDiameter / 2;
  const tankArea = Math.PI * tankRadius * tankRadius;
  const volume = waterLevel * tankArea * 1000;
  
  let fillRate = 0;
  let consumption = 0;
  
  if (data.length >= 2) {
    const recent = data.slice(Math.max(0, data.length - 6));
    for (let i = 1; i < recent.length; i++) {
      const prevLevel = (tankHeight - (recent[i - 1].value / 100)) / tankHeight * 100;
      const currLevel = (tankHeight - (recent[i].value / 100)) / tankHeight * 100;
      const diff = currLevel - prevLevel;
      
      if (diff > 0) {
        fillRate += diff;
      } else {
        consumption += Math.abs(diff);
      }
    }
    
    const timeWindowHours = (recent.length - 1) * 0.0167;
    fillRate = (fillRate / timeWindowHours) * tankArea * 10;
    consumption = (consumption / timeWindowHours) * tankArea * 10;
  }
  
  const isOnline = data.length > 0;
  
  return {
    currentLevel: percentage,
    volume: volume,
    fillRate: fillRate,
    consumption: consumption,
    status: isOnline ? 'ONLINE' : 'OFFLINE'
  };
};

const getLatestFeed = (feeds) => {
  if (!feeds || feeds.length === 0) return null;
  // ThingSpeak feeds are usually returned in chronological order
  return feeds[feeds.length - 1];
};

const fetchChannelFeeds = async (channelId, apiKey, results = 1) => {
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&minutes=1440&results=${Math.min(results, 8000)}`;
  const res = await axios.get(url, { timeout: 8000 });
  return Array.isArray(res.data?.feeds) ? res.data.feeds : [];
};

module.exports = {
  fetchSixHourData,
  fetchLatestData,
  fetchChannelFeeds,
  getLatestFeed,
  applyLightSmoothing,
  calculateMetrics
};
