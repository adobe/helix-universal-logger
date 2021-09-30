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
export * from './logger';

declare module '@adobe/helix-universal' {
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

  namespace HelixUniversal {
    // Extend context
    export interface UniversalContext {
      log: Logger;
    }
  }
}