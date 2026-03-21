export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message, details) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class UpstreamError extends ApiError {
  constructor(message, details) {
    super(502, 'UPSTREAM_ERROR', message, details);
    this.name = 'UpstreamError';
  }
}

export class UnavailableError extends ApiError {
  constructor(message, details) {
    super(503, 'DATA_UNAVAILABLE', message, details);
    this.name = 'UnavailableError';
  }
}

function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) {
    return new ApiError(500, 'INTERNAL_ERROR', err.message);
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'Unexpected server error');
}

function toErrorBody(err) {
  const apiErr = toApiError(err);
  const body = {
    error: {
      code: apiErr.code,
      message: apiErr.message,
    },
  };
  if (apiErr.details !== undefined) {
    body.error.details = apiErr.details;
  }
  return body;
}

function isExpressLikeResponse(res) {
  return typeof res?.status === 'function' && typeof res?.json === 'function';
}

export function sendJson(res, status, data, headers = {}) {
  if (isExpressLikeResponse(res)) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    return res.status(status).json(data);
  }

  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(data));
  return undefined;
}

export function sendApiError(res, err, { logLabel } = {}) {
  const apiErr = toApiError(err);
  if (logLabel) {
    console.error(`[${logLabel}] error:`, apiErr.message);
  }
  return sendJson(res, apiErr.status, toErrorBody(apiErr));
}

export function sendValidationError(res, message, details) {
  return sendApiError(res, new ValidationError(message, details));
}
