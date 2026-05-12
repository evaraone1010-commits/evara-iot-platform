const { z } = require("zod");

const fetchThingSpeakFieldsSchema = z.object({
  channelId: z.string()
});

const dataToValidate = {
  body: { channelId: "123" },
  query: {},
  params: {}
};

try {
  const result = fetchThingSpeakFieldsSchema.safeParse(dataToValidate);
  console.log("Success?", result.success);
  console.log("Error object:", result.error);
  console.log("Errors array:", result.error.errors);
} catch (e) {
  console.error("Caught exception:", e);
}
