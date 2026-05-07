/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ISSUE #6: Reusable Zod Validation Middleware
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Simple, reusable validation middleware for all POST/PUT routes.
 * Applies Zod schema to req.body, rejects unknown fields via .strict(),
 * and delegates Zod errors to centralized error handler.
 * 
 * USAGE:
 *   const validate = require('../middleware/validate');
 *   const { createUserSchema } = require('../schemas/user.schema');
 *   router.post('/', validate(createUserSchema), controller.create);
 * 
 * PATTERN:
 *   1. Schema uses .strict() to reject unknown fields
 *   2. validate() middleware parses and validates body
 *   3. If valid: req.body replaced with clean data, next()
 *   4. If invalid: delegates to centralized error handler via next(err)
 */

const { ZodError } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    const dataToValidate = {
      body: req.body,
      query: req.query,
      params: req.params,
    };

    // safeParse returns { success, data, error } — no throw
    const result = schema.safeParse(dataToValidate);
    
    if (!result.success) {
      // Create error object with Zod errors for centralized handler
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.details = result.error.issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code
      }));
      return next(error);
    }
    
    // ✅ CRITICAL: Replace request objects with clean, validated data
    // This strips any unknown fields (due to schema.strict())
    if (result.data.body) req.body = result.data.body;
    if (result.data.query) req.query = result.data.query;
    if (result.data.params) req.params = result.data.params;
    
    next();
  } catch (err) {
    // Unexpected error — delegate to centralized handler
    next(err);
  }
};

module.exports = validate;
