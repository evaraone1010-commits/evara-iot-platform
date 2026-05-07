async function test() {
  const url = `https://api.thingspeak.com/channels/9999999999/feeds.json?results=0`;
  const res = await fetch(url);
  const text = await res.text();
  console.log('text:', text);
}
test();
