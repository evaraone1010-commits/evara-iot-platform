const { z } = require('zod');

/**
 * Schema for updating an existing customer record.
 * Uses .strip() (default) to silently ignore keys we don't save to Firestore 
 * (like confirmPassword) while validating the ones we do.
 */
const updateCustomerSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  full_name: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  phone_number: z.string().optional(),
  address: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  zone_id: z.string().optional(),
  regionFilter: z.string().optional(),
  community_id: z.string().optional(),
  plan: z.string().optional(),
});

module.exports = { updateCustomerSchema };
