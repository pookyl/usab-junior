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

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

export function sendJson(res, status, data, headers = {}) {
  const serialized = JSON.stringify(data);
  const responseHeaders = {
    'Content-Type': 'application/json',
    'X-Payload-Bytes': String(Buffer.byteLength(serialized)),
    ...headers,
  };

  if (isExpressLikeResponse(res)) {
    for (const [key, value] of Object.entries(responseHeaders)) {
      res.setHeader(key, value);
    }
    const response = res.status(status);
    if (typeof response.send === 'function') {
      return response.send(serialized);
    }
    return response.json(data);
  }

  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...responseHeaders,
  });
  res.end(serialized);
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

export function createRequestMetrics(label) {
  const startedAt = nowMs();
  const steps = [];

  async function time(stepLabel, fn) {
    const stepStartedAt = nowMs();
    try {
      return await fn();
    } finally {
      steps.push({ label: stepLabel, durationMs: nowMs() - stepStartedAt });
    }
  }

  function buildHeaders(headers = {}) {
    const totalDurationMs = nowMs() - startedAt;
    const serverTiming = [
      `total;dur=${totalDurationMs.toFixed(1)}`,
      ...steps.map((step) => `${step.label};dur=${step.durationMs.toFixed(1)}`),
    ].join(', ');

    return {
      ...headers,
      'Server-Timing': serverTiming,
      'X-Response-Time-Ms': totalDurationMs.toFixed(1),
    };
  }

  function log(extra = {}) {
    const totalDurationMs = nowMs() - startedAt;
    console.info(`[perf:${label}]`, {
      totalMs: Number(totalDurationMs.toFixed(1)),
      steps: steps.map((step) => ({
        label: step.label,
        durationMs: Number(step.durationMs.toFixed(1)),
      })),
      ...extra,
    });
  }

  return {
    time,
    buildHeaders,
    log,
  };
}
