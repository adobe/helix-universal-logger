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
 * const { wrap } = require('@adobe/openwhisk-action-utils');
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
  rootLogger, JsonifyForLog, MultiLogger, SimpleInterface, messageFormatSimple, ConsoleLogger,
} = require('@adobe/helix-log');
const { Response } = require('@adobe/helix-fetch');
const { createNamespace } = require('cls-hooked');

const createCoralogixLogger = require('./logger-coralogix');

const CLS_NAMESPACE_NAME = 'uni-util-logger';
const LOGGER_INVOCATION_FIELDS_NAME = 'uni-fields';
const LOGGER_CDN_FIELDS_NAME = 'cdn-fields';

const CLS_NAMESPACE = createNamespace(CLS_NAMESPACE_NAME);

// define special 'serializers' for express request
JsonifyForLog.impl(http.IncomingMessage, (req) => ({
  method: req.method,
  url: req.url,
  headers: req.headers,
}));

// define special 'serializers' for express response
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
 * Special logger for universal functions that adds the invocation id, function name and
 * transaction id to each log message.
 * @private
 */
class UniversalLogger extends MultiLogger {
  constructor(logger, opts) {
    super(logger, {
      ...opts,
      filter: (fields) => {
        const ret = {
          ...fields,
        };

        const inv = CLS_NAMESPACE.get(LOGGER_INVOCATION_FIELDS_NAME);
        if (inv) {
          ret.inv = inv;
        }

        const cdn = CLS_NAMESPACE.get(LOGGER_CDN_FIELDS_NAME);
        if (cdn) {
          ret.cdn = cdn;
        }

        return ret;
      },
    });
  }
}

/**
 * Initializes helix-log that adds additional activation related fields to the loggers.
 * It also looks for credential params and tries to add additional external logger
 * (eg. coralogix).
 *
 * It also initializes `context.log` with a SimpleInterface if not already present.
 *
 * @param {UniversalContext} context - universal function context
 * @param {MultiLogger} [logger=rootLogger] - a helix multi logger. defaults to the helix
 *                                            `rootLogger`.
 * @param {string} [level] - Overall log-level. defaults to `params.LOG_LEVEL` or 'info`.
 * @return {SimpleInterface} the helix-log simple interface
 */
function init(context, logger = rootLogger, level) {
  const { env = {} } = context;

  // add universal logger to helix-log logger
  if (!logger.loggers.has('UniversalLogger')) {
    const uniLogger = new UniversalLogger({});
    logger.loggers.set('UniversalLogger', uniLogger);

    // add coralogix logger
    const coralogix = createCoralogixLogger(env, context);
    if (coralogix) {
      uniLogger.loggers.set('CoralogixLogger', coralogix);
    }
  }

  // ensure console logger is setup correctly
  if (logger === rootLogger) {
    logger.loggers.set('default', new ConsoleLogger({
      formatter: messageFormatSimple,
      level: 'trace',
    }));
  }

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
  }
  return simple;
}

/**
 * Takes an universal function and initializes logging, by invoking {@link init}.
 *
 * @param {UniversalFunction} fn original universal main function
 * @param {object} opts Additional wrapping options
 * @param {object} [opts.fields] - Additional fields to log with the `ow` logging fields.
 * @param {MultiLogger} [opts.logger=rootLogger] - a helix multi logger. defaults to the helix
 *                                                `rootLogger`.
 * @param {string} [opts.level] - Overall log-level. defaults to `params.LOG_LEVEL` or 'info`.
 * @param {Request} req function request,
 * @param {UniversalContext} context universal function context
 *
 * @private
 * @returns {*} the return value of the action
 */
async function instrumentAndRun(fn, opts, req, context) {
  const {
    logger = rootLogger,
    fields = {},
    level,
  } = opts || {};

  const {
    id, transactionId, requestId,
  } = context.invocation || {};

  const {
    package: packageName,
    name,
    version,
  } = context.func || {};

  return CLS_NAMESPACE.runAndReturn(async () => {
    CLS_NAMESPACE.set(LOGGER_INVOCATION_FIELDS_NAME, {
      invocationId: id || 'n/a',
      functionName: `/${packageName}/${name}/${version}`,
      transactionId: transactionId || 'n/a',
      requestId: requestId || 'n/a',
      ...fields,
    });

    if (req && req.headers && req.headers.has('x-cdn-url')) {
      CLS_NAMESPACE.set(LOGGER_CDN_FIELDS_NAME, {
        url: req.headers.get('x-cdn-url'),
      });
    }
    init(context, logger, level);
    return fn(req, context);
  });
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
 * const { wrap } = require('@adobe/openwhisk-action-utils');
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
  return (...args) => instrumentAndRun(fn, opts, ...args);
}

module.exports = Object.assign(wrap, {
  init,
  trace,
});
