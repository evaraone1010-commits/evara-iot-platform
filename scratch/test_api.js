async function test() {
  const res = await fetch("http://localhost:8080/api/v1/admin/zones", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer fake" // wait, it needs auth! I can't bypass it.
    }
  });
  console.log(res.status);
}
test();
