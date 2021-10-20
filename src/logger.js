/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-disable no-underscore-dangle */

/**
 * Wrap function that returns an Universal function that is enabled with logging.
 *
 * **Usage:**
 *
 * ```js
 * const wrap = require('@adobe/helix-shared-wrap');
 * const { logger } = require('@adobe/helix-universal-logger');
 *
 * async function main(req, context) {
 *   const { log } = context;
 *
 *   //…my action code…
 *   log.info('.....');
 * }
 *
 * module.exports.main = wrap(main)
 *   .with(logger.trace)
 *   .with(logger);
 * ```
 *
 * @module logger
 */

const http = require('http');
const {
  JsonifyForLog, MultiLogger, SimpleInterface, messageFormatSimple, ConsoleLogger,
} = require('@adobe/helix-log');
const { Response } = require('@adobe/helix-fetch');

const createCoralogixLogger = require('./logger-coralogix');

// define special 'serializers' for express request
/* istanbul ignore next */
JsonifyForLog.impl(http.IncomingMessage, (req) => ({
  method: req.method,
  url: req.url,
  headers: req.headers,
}));

// define special 'serializers' for express response
/* istanbul ignore next */
JsonifyForLog.impl(http.ServerResponse, (res) => {
  /* istanbul ignore next */
  if (!res || !res.statusCode) {
    return res;
  }
  /* istanbul ignore next */
  return {
    statusCode: res.statusCode,
    duration: res.duration,
    headers: res.getHeaders(),
  };
});

/**
 * Initializes helix-log that adds additional activation related fields to the loggers.
 * It also looks for credential params and tries to add additional external logger
 * (eg. coralogix).
 *
 * It also initializes `context.log` with a SimpleInterface if not already present.
 *
 * @param {Request} request - universal request
 * @param {UniversalContext} context - universal function context
 * @param {string} [opts.level] - Overall log-level. defaults to `params.LOG_LEVEL` or 'info`.
 * @param {object} [opts.fields] - optional constant fields to add to the `inv` field.
 * @return {SimpleInterface} the helix-log simple interface
 */
function init(request, context, opts = {}) {
  const { level, fields = {} } = opts;
  const {
    env = {},
    invocation: {
      id, transactionId, requestId,
    } = {},
    func: {
      package: packageName,
      name,
      version,
    } = {},
  } = context;

  // compute fields
  const defaultFields = {
    inv: {
      invocationId: id || 'n/a',
      functionName: `/${packageName}/${name}/${version}`,
      transactionId: transactionId || 'n/a',
      requestId: requestId || 'n/a',
      ...fields,
    },
  };

  if (request.headers.has('x-cdn-url')) {
    defaultFields.cdn = {
      url: request.headers.get('x-cdn-url'),
    };
  }

  const uniLogger = new MultiLogger({}, {
    defaultFields,
  });

  // add coralogix logger
  const coralogix = createCoralogixLogger(env, context);
  if (coralogix) {
    uniLogger.loggers.set('CoralogixLogger', coralogix);
  }

  const logger = new MultiLogger({
    default: new ConsoleLogger({
      formatter: messageFormatSimple,
      level: 'trace',
    }),
    UniversalLogger: uniLogger,
  }, { level });

  // create SimpleInterface if needed
  let simple = context.log;
  if (!simple) {
    simple = new SimpleInterface({
      logger,
      level: level || env.LOG_LEVEL || 'info',
    });
    // bind log methods to logger itself, so it's easier to pass them as functions.
    ['log', 'silly', 'trace', 'debug', 'verbose', 'info', 'warn', 'error', 'fatal'].forEach((n) => {
      simple[n] = simple[n].bind(simple);
    });
    context.log = simple;
  } else {
    simple.logger = logger;
  }
  return simple;
}

/**
 * Cleans up a header value by stripping invalid characters and truncating to 1024 chars
 *
 * todo: use the one from helix shared
 *
 * @param {string} value a header value
 * @returns a valid header value
 */
function cleanupHeaderValue(value) {
  return value.replace(/[^\t\u0020-\u007E\u0080-\u00FF]/g, '').substr(0, 1024);
}

/**
 * Creates a tracer function that logs invocation details on `trace` level before and after the
 * actual action invocation.
 *
 * @param {UniversalFunction} fn - original OpenWhisk action main function
 * @returns {UniversalFunction} an action function instrumented with tracing.
 */
function trace(fn) {
  return async (req, context) => {
    try {
      const { log } = context;
      if (!log) {
        return fn(req, context);
      }

      const disclosedParams = { ...context.env };
      Object.keys(disclosedParams)
        .forEach((key) => {
          if (key.match(/^[A-Z0-9_]+$/)) {
            delete disclosedParams[key];
          }
        });
      delete disclosedParams.__ow_logger;

      // be a bit compatible
      const trc = log.traceFields ? (f, m) => log.traceFields(m, f) : log.trace;
      const err = log.errorFields ? (f, m) => log.errorFields(m, f) : log.error;
      try {
        trc({
          params: disclosedParams,
        }, 'before');
        const result = await fn(req, context);
        trc({
          result,
        }, 'result');
        return result;
      } catch (e) {
        err({
          params: disclosedParams,
          error: e.toString(),
        }, 'error');
        return new Response('', {
          status: e.statusCode || 500,
          headers: {
            'x-error': cleanupHeaderValue(e.message),
          },
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return new Response('', {
        status: e.statusCode || 500,
        headers: {
          'x-error': cleanupHeaderValue(e.message),
        },
      });
    }
  };
}

/**
 * Wrap function that returns an universal function that is enabled with logging.
 *
 * @example <caption></caption>
 *
 * ```js
 * const wrap = require('@adobe/helix-shared-wrap');
 * const { logger } = require('@adobe/helix-universal-logger');
 *
 * async function main(req, context) {
 *   const { log } = context;
 *
 *   //…my action code…
 *   log.info('.....');
 * }
 *
 * module.exports.main = wrap(main)
 *   .with(logger.trace)
 *   .with(logger);
 * ```
 *
 * @function logger
 * @param {UniversalFunction} fn - original universal main function
 * @param {WrapOptions} [opts] - optional options.
 * @returns {function(...[*]): *} a the wrapped function.
 */
function wrap(fn, opts) {
  return (req, context) => {
    init(req, context, opts);
    return fn(req, context);
  };
}

module.exports = Object.assign(wrap, {
  trace,
});
