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

import { MultiLogger, SimpleInterface } from '@adobe/helix-log';

/**
 * Fetch Request
 */
export declare class Request {}

/**
 * Fetch Response
 */
export declare class Response {}


/**
 * Logger object exposed through context
 */
interface Logger {
  info: (...msgs: any[]) => void;
  error: (...msgs: any[]) => void;
  warn: (...msgs: any[]) => void;
  log: (...msg: any[]) => void;
  fatal: (...msg: any[]) => void;
  verbose: (...msg: any[]) => void;
  debug: (...msg: any[]) => void;
  trace: (...msg: any[]) => void;
  silly: (...msg: any[]) => void;
}
 
/**
 * Universal context extension
 */
export declare interface UniversalContext {
  log: Logger;
}

/**
 * Helix Universal Function
 */
export declare type UniversalFunction = (req: Request, context: UniversalContext) => Response;


/**
 * Options for the wrap functions
 */
declare interface WrapOptions {

  /**
   * Helix multi logger. defaults to the helix `rootLogger`.
   */
  logger?: MultiLogger,

  /**
   * Additional fields to log with the `ow` logging fields.
   */
  fields?: object,

  /**
   * Overall log level. defaults to `params.LOG_LEVEL` or 'info`
   */
  level?: string,
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
 * @returns {UniversalFunction} a new function with the same signature as your original main function
 */
export declare function wrap(fn: UniversalFunction, opts: WrapOptions): UniversalFunction;

export declare namespace logger {
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
  export function init(context: UniversalContext, logger: MultiLogger, level?: string): SimpleInterface;

  /**
   * Creates a tracer function that logs invocation details on `trace` level before and after the
   * actual action invocation.
   *
   * @param {UniversalFunction} fn - original universal main function
   * @returns {UniversalFunction} an action function instrumented with tracing.
   */
  export function trace(fn: UniversalFunction): UniversalFunction;
}
