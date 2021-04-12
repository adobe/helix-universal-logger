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

/* eslint-env mocha */
/* eslint-disable no-underscore-dangle,camelcase */

const assert = require('assert');
const nock = require('nock');
const { MultiLogger, MemLogger } = require('@adobe/helix-log');
const { wrap } = require('@adobe/helix-shared');
const { Request } = require('@adobe/helix-fetch');
const logger = require('../src/logger.js');

const DEFAULT_CONTEXT = {
  env: {},
  func: {
    name: 'test-my-action-name',
    version: '1.2.3',
    package: 'test-package',
  },
  invocation: {
    id: 'test-my-activation-id',
    transactionId: 'test-transaction-id',
    requestId: 'test-request-id',
  },
};

describe('Loggers', () => {
  let myRootLogger;
  let memLogger;

  beforeEach(() => {
    memLogger = new MemLogger({
      level: 'trace',
      filter: (fields) => ({
        ...fields,
        timestamp: '1970-01-01T00:00:00.000Z',
      }),
    });
    myRootLogger = new MultiLogger({});
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('init does not fail if __ow_logger is not a bunyan logger.', () => {
    logger.init({
      __ow_logger: 42,
    }, myRootLogger);

    logger.init({
      __ow_logger: {},
    }, myRootLogger);
  });

  it('init sets up openwhisk logging and keeps default unaffected', () => {
    const log = logger.init({}, myRootLogger);
    myRootLogger.loggers.set('default', memLogger);

    log.info('Hello, world');
    assert.deepEqual(memLogger.buf, [{
      level: 'info',
      message: ['Hello, world'],
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('init uses info as default log-level', () => {
    const log = logger.init({}, myRootLogger);
    myRootLogger.loggers.set('default', memLogger);

    log.debug('Hello, world');
    log.info('Hello, world');
    log.warn('Hello, world');
    assert.equal(memLogger.buf.map((r) => (r.level)).join(), 'info,warn');
  });

  it('init takes log level argument', () => {
    const log = logger.init({}, myRootLogger, 'debug');
    myRootLogger.loggers.set('default', memLogger);

    log.debug('Hello, world');
    log.info('Hello, world');
    log.warn('Hello, world');
    assert.equal(memLogger.buf.map((r) => (r.level)).join(), 'debug,info,warn');
  });

  it('init uses LOG_LEVEL param', () => {
    const log = logger.init({ env: { LOG_LEVEL: 'debug' } }, myRootLogger);
    myRootLogger.loggers.set('default', memLogger);

    log.debug('Hello, world');
    log.info('Hello, world');
    log.warn('Hello, world');
    assert.equal(memLogger.buf.map((r) => (r.level)).join(), 'debug,info,warn');
  });

  it('logging adds invocation fields with defaults', () => {
    const log = logger.init({}, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    logger(() => {
      log.info('Hello, world');
    })({}, {});

    assert.deepEqual(memLogger.buf, [{
      level: 'info',
      message: ['Hello, world'],
      inv: {
        functionName: '/undefined/undefined/undefined',
        invocationId: 'n/a',
        requestId: 'n/a',
        transactionId: 'n/a',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('log methods are bound to logger', () => {
    const context = {};
    logger.init(context, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    const { info } = context.log;
    info('Hello, world');
    assert.deepEqual(memLogger.buf, [{
      level: 'info',
      message: ['Hello, world'],
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('universal logging adds inv fields', () => {
    const log = logger.init({}, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    logger(() => {
      log.info('Hello, world');
    })([], { ...DEFAULT_CONTEXT });

    assert.deepEqual(memLogger.buf, [{
      level: 'info',
      message: ['Hello, world'],
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('wrap and trace inits logging and traces params but no secrets', async () => {
    async function main(req, context) {
      const { log } = context;
      log.info('Hello, world.');
      return {
        body: 'ok',
      };
    }

    myRootLogger.loggers.set('mylogger', memLogger);
    const result = await logger(logger.trace(main), { logger: myRootLogger, level: 'trace' })({}, {
      ...DEFAULT_CONTEXT,
      env: {
        path: '/foo',
        SECRET: 'psst',
      },
    });

    assert.deepEqual(result, { body: 'ok' });

    assert.deepEqual(memLogger.buf, [{
      level: 'trace',
      message: ['before'],
      params: {
        path: '/foo',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }, {
      level: 'info',
      message: ['Hello, world.'],
      timestamp: '1970-01-01T00:00:00.000Z',
    }, {
      level: 'trace',
      message: ['result'],
      result: {
        body: 'ok',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('logger can be used as with wrap chain', async () => {
    async function main(req, context) {
      const { log } = context;
      log.info('Hello, world.');
      return {
        body: 'ok',
      };
    }

    logger.init({}, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    const action = wrap(main).with(logger.trace).with(logger, {
      fields: { foo: 'bar' },
      logger: myRootLogger,
      level: 'trace',
    });
    const result = await action({}, {
      ...DEFAULT_CONTEXT,
      env: {
        path: '/foo',
        SECRET_KEY: 'foobar',
      },
    });

    assert.deepEqual(result, { body: 'ok' });

    assert.deepEqual(memLogger.buf, [{
      level: 'trace',
      message: ['before'],
      params: {
        path: '/foo',
      },
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
        foo: 'bar',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }, {
      level: 'info',
      message: ['Hello, world.'],
      timestamp: '1970-01-01T00:00:00.000Z',
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
        foo: 'bar',
      },
    }, {
      level: 'trace',
      message: ['result'],
      result: {
        body: 'ok',
      },
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
        foo: 'bar',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('trace catches and sanitizes error', async () => {
    function main() {
      throw new Error('ωario is bad!');
    }

    logger.init({}, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    const action = wrap(main).with(logger.trace).with(logger, {
      fields: { foo: 'bar' },
      logger: myRootLogger,
      level: 'trace',
    });
    const result = await action({}, {
      ...DEFAULT_CONTEXT,
      env: {
        path: '/foo',
        SECRET_KEY: 'foobar',
      },
    });

    assert.deepEqual(result.status, 500);
    assert.deepEqual(result.headers.get('x-error'), 'ario is bad!');

    assert.deepEqual(memLogger.buf, [{
      level: 'trace',
      message: ['before'],
      params: {
        path: '/foo',
      },
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
        foo: 'bar',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }, {
      error: 'Error: ωario is bad!',
      inv: {
        foo: 'bar',
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
      },
      level: 'error',
      message: [
        'error',
      ],
      params: {
        path: '/foo',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });

  it('trace doesn\'t complain if no logger', async () => {
    async function main() {
      return {
        body: 'ok',
      };
    }

    const action = wrap(main).with(logger.trace);
    const result = await action({}, DEFAULT_CONTEXT);
    assert.deepEqual(result, { body: 'ok' });
  });

  it('trace catches error even when no logger', async () => {
    function main() {
      throw new Error('ωario is bad!');
    }
    const action = wrap(main).with(logger.trace);
    const result = await action({}, {
      ...DEFAULT_CONTEXT,
      env: {
        path: '/foo',
        SECRET_KEY: 'foobar',
      },
    });

    assert.deepEqual(result.status, 500);
    assert.deepEqual(result.headers.get('x-error'), 'ario is bad!');
  });

  it('creates coralogix logger if needed', async () => {
    const log = logger.init({
      ...DEFAULT_CONTEXT,
      env: {
        CORALOGIX_API_KEY: '1234',
        CORALOGIX_APPLICATION_NAME: 'logger-test',
        CORALOGIX_SUBSYSTEM_NAME: 'test-1',
        CORALOGIX_LOG_LEVEL: 'info',
      },
    }, myRootLogger);

    const reqs = [];
    const scope = nock('https://api.coralogix.com')
      .post('/api/v1/logs')
      .reply((uri, requestBody) => {
        reqs.push(requestBody);
        return [200, 'ok'];
      });

    logger(() => {
      log.infoFields('Hello, world', { myId: 42 });
    })({}, { ...DEFAULT_CONTEXT });
    // nock 13.0 needs a tick to reply to a request
    // see https://github.com/nock/nock/blob/75507727cf09a0b7bf0aa7ebdf3621952921b82e/migration_guides/migrating_to_13.md
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await scope.done();
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].applicationName, 'logger-test');
    assert.equal(reqs[0].subsystemName, 'test-1');
    assert.equal(reqs[0].privateKey, '1234');
    assert.equal(reqs[0].logEntries.length, 1);

    const logEntry = JSON.parse(reqs[0].logEntries[0].text);
    delete logEntry.timestamp;
    assert.deepEqual(logEntry, {
      level: 'info',
      message: 'Hello, world',
      myId: 42,
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
      },
    });
  });

  it('logging adds cdn.url field', () => {
    const log = logger.init({}, myRootLogger);
    myRootLogger.loggers.get('UniversalLogger').loggers.set('mylogger', memLogger);

    logger(() => {
      log.info('Hello, world');
    })(new Request('https://www.example.com/', {
      headers: {
        'x-cdn-url': 'https://www.domain.com/index.html?q=abc',
      },
    }), { ...DEFAULT_CONTEXT });

    assert.deepEqual(memLogger.buf, [{
      level: 'info',
      message: ['Hello, world'],
      inv: {
        functionName: '/test-package/test-my-action-name/1.2.3',
        invocationId: 'test-my-activation-id',
        requestId: 'test-request-id',
        transactionId: 'test-transaction-id',
      },
      cdn: {
        url: 'https://www.domain.com/index.html?q=abc',
      },
      timestamp: '1970-01-01T00:00:00.000Z',
    }]);
  });
});
