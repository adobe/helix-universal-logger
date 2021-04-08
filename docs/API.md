<a name="module_logger"></a>

## logger
Wrap function that returns an Universal function that is enabled with logging.

**Usage:**

```js
const { wrap } = require('@adobe/openwhisk-action-utils');
const { logger } = require('@adobe/helix-universal-logger');

async function main(req, context) {
  const { log } = context;

  //…my action code…
  log.info('.....');
}

module.exports.main = wrap(main)
  .with(logger.trace)
  .with(logger);
```


* [logger](#module_logger)
    * [~init(context, [logger], [level])](#module_logger..init) ⇒ <code>SimpleInterface</code>
    * [~cleanupHeaderValue(value)](#module_logger..cleanupHeaderValue) ⇒
    * [~trace(fn)](#module_logger..trace) ⇒ <code>UniversalFunction</code>
    * [~logger(fn, [opts])](#module_logger..logger) ⇒ <code>function</code>

<a name="module_logger..init"></a>

### logger~init(context, [logger], [level]) ⇒ <code>SimpleInterface</code>
Initializes helix-log that adds additional activation related fields to the loggers.
It also looks for credential params and tries to add additional external logger
(eg. coralogix).

It also initializes `context.log` with a SimpleInterface if not already present.

**Kind**: inner method of [<code>logger</code>](#module_logger)  
**Returns**: <code>SimpleInterface</code> - the helix-log simple interface  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| context | <code>UniversalContext</code> |  | universal function context |
| [logger] | <code>MultiLogger</code> | <code>rootLogger</code> | a helix multi logger. defaults to the helix                                            `rootLogger`. |
| [level] | <code>string</code> |  | Overall log-level. defaults to `params.LOG_LEVEL` or 'info`. |

<a name="module_logger..cleanupHeaderValue"></a>

### logger~cleanupHeaderValue(value) ⇒
Cleans up a header value by stripping invalid characters and truncating to 1024 chars

todo: use the one from helix shared

**Kind**: inner method of [<code>logger</code>](#module_logger)  
**Returns**: a valid header value  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | a header value |

<a name="module_logger..trace"></a>

### logger~trace(fn) ⇒ <code>UniversalFunction</code>
Creates a tracer function that logs invocation details on `trace` level before and after the
actual action invocation.

**Kind**: inner method of [<code>logger</code>](#module_logger)  
**Returns**: <code>UniversalFunction</code> - an action function instrumented with tracing.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>UniversalFunction</code> | original OpenWhisk action main function |

<a name="module_logger..logger"></a>

### logger~logger(fn, [opts]) ⇒ <code>function</code>
Wrap function that returns an universal function that is enabled with logging.

**Kind**: inner method of [<code>logger</code>](#module_logger)  
**Returns**: <code>function</code> - a the wrapped function.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>UniversalFunction</code> | original universal main function |
| [opts] | <code>WrapOptions</code> | optional options. |

**Example**  

```js
const { wrap } = require('@adobe/openwhisk-action-utils');
const { logger } = require('@adobe/helix-universal-logger');

async function main(req, context) {
  const { log } = context;

  //…my action code…
  log.info('.....');
}

module.exports.main = wrap(main)
  .with(logger.trace)
  .with(logger);
```
