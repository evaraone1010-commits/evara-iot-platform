const { z } = require("zod");

const fetchThingSpeakFieldsSchema = z.object({
  channelId: z.string()
});

const dataToValidate = {
  body: { channelId: "123" },
  query: {},
  params: {}
};

const result = fetchThingSpeakFieldsSchema.safeParse(dataToValidate);
console.log("Keys:", Object.keys(result.error));
console.log("issues array:", result.error?.issues);
console.log("errors array:", result.error?.errors);
