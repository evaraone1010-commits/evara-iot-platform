async function test() {
  const res = await fetch("http://localhost:8080/api/v1/thingspeak/fetch-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId: "2613728", apiKey: "2EUV9OVC62430JXO" })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}
test();
