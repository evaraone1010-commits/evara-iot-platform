const logger = require('../utils/logger');
const { sanitizeRequest, sanitizeError } = require('../utils/requestSanitizer');
const { AppError } = require('../utils/AppError');

const isDev = () => process.env.NODE_ENV !== 'production';

const getPublicMessage = (statusCode) => {
  const messages = {
    400: "Bad request — check your input and try again",
    401: "Authentication required",
    403: "You do not have permission to perform this action",
    404: "The requested resource was not found",
    409: "A conflict occurred — the resource may already exist",
    422: "Validation failed — check your request body",
    429: "Too many requests — please slow down",
    500: "Something went wrong on our end — we have been notified",
    502: "Upstream service unavailable",
    503: "Service temporarily unavailable",
  };
  return messages[statusCode] || "An unexpected error occurred";
};

const createErrorResponse = (error, statusCode = 500) => {
  const isDevelopment = isDev();
  
  return {
    success: false,
    error: {
      message: isDevelopment
        ? (error.message || 'Internal Server Error')
        : getPublicMessage(statusCode),
      code: error.code || 'APP_ERROR',
      statusCode,
      ...(isDevelopment && error.stack ? { stack: error.stack } : {}),
      ...(error.details && isDevelopment ? { details: error.details } : {}),
    },
    timestamp: new Date().toISOString()
  };
};

const errorHandler = (err, req, res, next) => {
  const sanitizedReq = sanitizeRequest(req);
  const sanitizedErr = sanitizeError(err);

  if (isDev()) {
    logger.error('Request error', err, {
      ...sanitizedReq,
      error: sanitizedErr,
      stack: err.stack
    });
  } else {
    logger.error('Request error', err, {
      method: req.method,
      url: req.url,
      userId: req.user?.uid ? req.user.uid.substring(0, 4) + '***' : 'anonymous',
      error: sanitizedErr
    });
  }

  let statusCode = err.statusCode || 500;

  // Handle common Firebase/other errors
  if (!err.statusCode) {
    if (err.name === 'ValidationError' || err.name === 'ZodError') statusCode = 400;
    else if (err.name === 'UnauthorizedError') statusCode = 401;
    else if (err.name === 'ForbiddenError') statusCode = 403;
    else if (err.name === 'NotFoundError') statusCode = 404;
  }

  res.status(statusCode).json(createErrorResponse(err, statusCode));
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler
};
