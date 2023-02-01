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
import { CoralogixLogger } from '@adobe/helix-log';

let coralogixLogger = null;

export default function createCoralogixLogger(env, context) {
  const {
    CORALOGIX_API_KEY,
    CORALOGIX_APPLICATION_NAME,
    CORALOGIX_SUBSYSTEM_NAME,
    CORALOGIX_LOG_LEVEL = 'info',
  } = env;
  if (!CORALOGIX_API_KEY) {
    return null;
  }
  if (!coralogixLogger) {
    // we use the openwhisk package name as subsystem
    const applicationName = CORALOGIX_APPLICATION_NAME || context.func?.app || 'n/a';
    const subsystemName = CORALOGIX_SUBSYSTEM_NAME || context.func?.package || 'n/a';
    // eslint-disable-next-line no-console
    console.log(`configured coralogix logger with: ${applicationName} / ${subsystemName}`);
    coralogixLogger = new CoralogixLogger(CORALOGIX_API_KEY, applicationName, subsystemName, {
      level: CORALOGIX_LOG_LEVEL,
    });
  }
  return coralogixLogger;
}

// used for testing
createCoralogixLogger.reset = () => {
  coralogixLogger = null;
};
