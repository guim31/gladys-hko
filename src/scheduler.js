// -----------------------------------------------------------------------------
// The refresh timer: one cycle refreshes the data sets that expired, then
// waits for the next one.
//
// The cadence is not a setting: a cycle comes back every 10 minutes, and the
// store (store.js) only calls the Observatory for the data sets whose answer
// expired (10 minutes for the current report and the warnings, 30 for the
// forecasts and the nowcast). A random delay of up to 2 minutes is added:
// thousands of Gladys must not all call at the same second.
//
// Nothing is called while no house of Gladys lies in Hong Kong: the
// Observatory has nothing to say about it.
//
// A timer inside the container, not the Gladys device polling: a weather
// integration has no devices. It is a chain of timeouts rather than an
// interval, so that a failed cycle retried sooner re-plans cleanly.
//
// The rainfall nowcast (2.7 MB, over two minutes to download from far
// away) is fetched in the background once the cycle is done: a warning change
// must not wait for it. When a new file arrives, `onNowcast` reads it.
//
// A cycle stops at a 429 or a 403, which would repeat for every data set. When
// every call of a cycle failed for a passing reason (network, 5xx), the next
// try comes after 5, 10, 20, 40, then 60 minutes. Cycles never overlap: a
// cycle asked for while one runs is queued behind it.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './api.js';
import { inHongKong } from './area.js';
import { createFailureLog } from './failure-log.js';
import { DATASETS } from './store.js';

const MIN_INTERVAL_MS = 10 * 60 * 1000;
const JITTER_MS = 2 * 60 * 1000;
const RETRY_FIRST_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

// In this order: the warnings first, they matter most. The nowcast is not
// in the list: its slow download runs beside the cycle (see cycle()).
const CYCLE_DATASETS = Object.freeze([
  DATASETS.warnings,
  DATASETS.current,
  DATASETS.forecast,
  DATASETS.local,
]);

/**
 * @description Create the refresh scheduler.
 * @param {object} options - Options.
 * @param {object} options.houses - The house registry (houses.js).
 * @param {object} options.store - The data store (store.js).
 * @param {Function} [options.onCycle] - `(summary) => Promise|void`, called at
 * the end of each cycle with `{ houses, inArea, refreshed, failed, error,
 * delayMs }` (`inArea`: the located houses in Hong Kong).
 * @param {Function} [options.onNowcast] - `() => Promise|void`, called when a
 * new nowcast file was downloaded.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @param {Function} [options.random] - `() => [0, 1)`, for the tests.
 * @param {Function} [options.setTimer] - setTimeout, for the tests.
 * @param {Function} [options.clearTimer] - clearTimeout, for the tests.
 * @returns {object} The scheduler ({ start, stop, requestCycle, settled }).
 * @example
 * const scheduler = createScheduler({ houses, store });
 */
function createScheduler({
  houses,
  store,
  onCycle = () => {},
  onNowcast = () => {},
  logger = console,
  now = Date.now,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  let running = null;
  let queued = false;
  let started = false;
  let failedCycles = 0;
  let nowcastRun = null;
  const failures = createFailureLog(logger);

  /**
   * @description Download the nowcast in the background, if it expired and
   * no download runs; `onNowcast` once a new file is in.
   * @example
   * refreshNowcast();
   */
  function refreshNowcast() {
    if (nowcastRun !== null || store.blockedError() !== null) {
      return;
    }
    const before = store.peek(DATASETS.nowcast)?.fetchedAt ?? null;
    nowcastRun = store
      .refresh(DATASETS.nowcast)
      .then(async (entry) => {
        if (entry.fetchedAt !== before) {
          await onNowcast();
        }
        failures.recover('nowcast', 'Nowcast handling works again');
      })
      .catch((err) => {
        if (err.kind === undefined) {
          failures.fail('nowcast', `Nowcast handling failed: ${err.message}`);
        } else {
          // The store already logged the failure, once.
          logger.debug(`Refresh of the nowcast failed: ${err.message}`);
        }
      })
      .finally(() => {
        nowcastRun = null;
      });
  }

  /**
   * @description Arm the next cycle.
   * @param {number} delayMs - The delay.
   * @example
   * schedule(10 * 60000);
   */
  function schedule(delayMs) {
    if (!started) {
      return;
    }
    if (timer !== null) {
      clearTimer(timer);
    }
    timer = setTimer(() => {
      timer = null;
      return requestCycle();
    }, delayMs);
    // Never hold the process alive just for the timer.
    timer?.unref?.();
  }

  /**
   * @description The delay before the next cycle.
   * @param {boolean} allFailed - Whether every call of the cycle failed.
   * @returns {number} The delay in ms.
   * @example
   * nextDelay(false);
   */
  function nextDelay(allFailed) {
    const jitter = Math.floor(random() * JITTER_MS);
    if (store.blockedError() !== null) {
      // Paused by a 429 or a 403: come back when the pause ends.
      return Math.max(0, store.blockedUntil - now()) + jitter;
    }
    if (allFailed) {
      failedCycles += 1;
      return Math.min(RETRY_FIRST_MS * 2 ** (failedCycles - 1), RETRY_MAX_MS) + jitter;
    }
    failedCycles = 0;
    return MIN_INTERVAL_MS + jitter;
  }

  /**
   * @description Run one cycle: refresh the expired data sets.
   * @returns {Promise<object>} The summary.
   * @example
   * await cycle();
   */
  async function cycle() {
    const located = await houses.refresh();
    const inArea = located.filter((house) => inHongKong(house.latitude, house.longitude));
    let refreshed = 0;
    let failedCount = 0;
    let error = null;
    if (inArea.length > 0) {
      error = store.blockedError();
      if (error !== null) {
        failedCount = CYCLE_DATASETS.length;
      }
      for (const name of error === null ? CYCLE_DATASETS : []) {
        try {
          await store.refresh(name);
          refreshed += 1;
        } catch (err) {
          failedCount += 1;
          error = err;
          // The store already logged the failure, once.
          logger.debug(`Refresh of ${name} failed: ${err.message}`);
          if (err.kind === ERROR_KINDS.THROTTLED || err.kind === ERROR_KINDS.FORBIDDEN) {
            error = err;
            failedCount = CYCLE_DATASETS.length - refreshed;
            break;
          }
        }
      }
    }
    const delayMs = nextDelay(inArea.length > 0 && refreshed === 0 && failedCount > 0);
    const summary = {
      houses: located.length,
      inArea: inArea.length,
      refreshed,
      failed: failedCount,
      error,
      delayMs,
    };
    try {
      await onCycle(summary);
      failures.recover('end-of-cycle', 'End-of-cycle handling works again');
    } catch (err) {
      failures.fail('end-of-cycle', `End-of-cycle handling failed: ${err.message}`);
    }
    failures.recover('cycle', 'Refresh cycles run again');
    schedule(delayMs);
    if (inArea.length > 0) {
      refreshNowcast();
    }
    return summary;
  }

  /**
   * @description Run a cycle now, or right after the one under way.
   * @returns {Promise<object>} The summary of the cycle that ran.
   * @example
   * await scheduler.requestCycle();
   */
  function requestCycle() {
    if (running !== null) {
      queued = true;
      return running;
    }
    running = cycle()
      .catch((err) => {
        failures.fail('cycle', `Refresh cycle failed: ${err.message}`);
        schedule(RETRY_FIRST_MS);
        return {
          houses: 0,
          inArea: 0,
          refreshed: 0,
          failed: 0,
          error: err,
          delayMs: RETRY_FIRST_MS,
        };
      })
      .finally(() => {
        running = null;
        if (queued) {
          queued = false;
          requestCycle();
        }
      });
    return running;
  }

  /**
   * @description Start the refreshes: a first cycle right away.
   * @returns {Promise<object>} The summary of the first cycle.
   * @example
   * await scheduler.start();
   */
  function start() {
    started = true;
    return requestCycle();
  }

  /**
   * @description Wait for the cycle under way, if any (and the one queued
   * behind it), and for the nowcast download.
   * @returns {Promise<void>} Resolves once no cycle runs.
   * @example
   * await scheduler.settled();
   */
  async function settled() {
    while (running !== null || nowcastRun !== null) {
      await (running ?? nowcastRun);
    }
  }

  /**
   * @description Stop the refreshes.
   * @example
   * scheduler.stop();
   */
  function stop() {
    started = false;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    requestCycle,
    settled,
    get started() {
      return started;
    },
  };
}

export {
  CYCLE_DATASETS,
  JITTER_MS,
  MIN_INTERVAL_MS,
  RETRY_FIRST_MS,
  RETRY_MAX_MS,
  createScheduler,
};
