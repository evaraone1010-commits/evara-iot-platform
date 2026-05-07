const { z } = require("zod");

const listQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(256).optional(),
    zone_id: z.string().optional(),
    community_id: z.string().optional(),
    customer_id: z.string().optional()
  }).strict()
});

try {
  listQuerySchema.parse({
    query: {
      limit: 50,
      sortBy: "created_at",
      sortOrder: "desc"
    }
  });
  console.log("Success");
} catch(e) {
  console.error("Failed:", e.issues);
}
