// -----------------------------------------------------------------------------
// Houses of the Gladys instance, for the scene triggers, the scene actions
// and the widgets.
//
// The weather path never needs them: the core passes the coordinates of the
// house in every onWeatherGet call. But the rain and frost triggers fire
// without anyone asking, and the scene actions and widgets name a house:
// hence `location: true` in the manifest and `getHouses()` here.
//
// A house is chosen in a `source: "houses"` select (Gladys 5.2.0+): the value
// received is its SELECTOR, the identifier GET /house returns, and the same
// selector goes in the `house` key of the scene events, so that the "House"
// filter of a trigger matches by equality. An empty choice means the first
// located house, the common single-house case.
//
// There is no update event for the houses: they are re-read on every
// connection and on each round of the forecast watcher (a local call).
// -----------------------------------------------------------------------------

/**
 * @description Create the house registry.
 * @param {object} options - Options.
 * @param {Function} options.fetchHouses - `() => Promise<Array<object>>`, the
 * SDK getHouses().
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @returns {object} The registry ({ refresh, list, resolve }).
 * @example
 * const houses = createHouseRegistry({ fetchHouses: () => gladys.getHouses() });
 */
function createHouseRegistry({ fetchHouses, logger = console }) {
  // Located houses only: an unlocated house has no weather.
  let located = [];
  let all = [];

  /**
   * @description Re-read the houses from Gladys. A failure keeps the previous
   * list: a transient error must not blind the triggers.
   * @returns {Promise<Array<object>>} The located houses.
   * @example
   * await houses.refresh();
   */
  async function refresh() {
    try {
      const houses = await fetchHouses();
      all = Array.isArray(houses) ? houses : [];
      located = all.filter(
        (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
      );
    } catch (err) {
      logger.warn(`Unable to read the houses of Gladys: ${err.message}`);
    }
    return located;
  }

  /**
   * @description The located houses, as last read.
   * @returns {Array<object>} `[{ id, name, selector, latitude, longitude }]`.
   * @example
   * houses.list();
   */
  function list() {
    return located;
  }

  /**
   * @description Find the house a scene action or a widget targets.
   * @param {string|null|undefined} selector - The "House" choice.
   * @returns {object} The house.
   * @throws {Error} When no house is located, or the chosen one is unknown or
   * has no location (its `code` says which: 'no_house', 'unknown_house',
   * 'not_located').
   * @example
   * houses.resolve('main-house');
   */
  function resolve(selector) {
    if (selector !== null && selector !== undefined && String(selector).trim() !== '') {
      const wanted = String(selector).trim();
      const house = located.find((candidate) => candidate.selector === wanted);
      if (house) {
        return house;
      }
      const known = all.find((candidate) => candidate.selector === wanted);
      const err = new Error(
        known
          ? `The house "${known.name}" has no location: set it in the house settings`
          : `No house of Gladys has the selector "${wanted}" any more`,
      );
      err.code = known ? 'not_located' : 'unknown_house';
      err.houseName = known ? known.name : wanted;
      throw err;
    }
    if (located.length === 0) {
      const err = new Error('No house of Gladys has a location: set it in the house settings');
      err.code = 'no_house';
      throw err;
    }
    return located[0];
  }

  return { refresh, list, resolve };
}

export { createHouseRegistry };
