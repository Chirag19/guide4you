import Interaction from 'ol/interaction/Interaction'

/**
 * @typedef {object} MapEventInteractionOptions
 * @property {string} [type=singleclick] the map event type to listen to
 */

export class MapEventInteraction extends Interaction {
  /**
   * @param {MapEventInteractionOptions} options
   */
  constructor (options = {}) {
    const type = options.type || 'singleclick'
    super({
      handleEvent: e => {
        if (this.getActive() && e.type === type) {
          this.handleMapEvent(e)
        }
        return true
      }
    })
  }

  handleMapEvent (e) {
    this.dispatchEvent({
      type: 'mapevent',
      mapEvent: e
    })
  }
}
