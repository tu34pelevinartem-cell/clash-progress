/* Images follow the exported object level, independently of the upgrade goal. */
(function (root) {
  'use strict';
  const safePath = value => typeof value === 'string' && /^assets\/[a-zA-Z0-9_-]+\.png$/.test(value) ? value : null;
  function image(entity, level) {
    if (!entity) return null;
    if (entity.imagesByLevel && Object.keys(entity.imagesByLevel).length) {
      // Never substitute the latest model for a missing or unknown level.
      if (!Number.isInteger(level) || level < 1) return null;
      return safePath(entity.imagesByLevel[level]);
    }
    // Heroes, equipment and some spells use the same icon at every level.
    return entity.imageIsGeneric === true ? safePath(entity.image) : null;
  }
  const api = { image };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClashArt = api;
})(typeof window === 'undefined' ? globalThis : window);
