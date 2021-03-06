import OlOverviewMap from 'ol/control/OverviewMap'

import { RewireMixin } from './RewireMixin'
import { ListenerOrganizerMixin } from '../ListenerOrganizerMixin'
import { mixin } from '../utilities'

import '../../less/overviewmap.less'
import { copyDeep } from '../utilitiesObject.js'

/**
 * @typedef {g4uControlOptions} OverviewMapOptions
 * @property {Localizable} [tipLabel]
 * @property {ol.layer.Group} [layerGroup]
 */

/**
 * @extends Control
 */
export class OverviewMap extends mixin(mixin(OlOverviewMap, RewireMixin), ListenerOrganizerMixin) {
  /**
   * @param {OverviewMapOptions} [options={}]
   */
  constructor (options = {}) {
    if (options.hasOwnProperty('title')) {
      options.tipLabel = options.localiser.selectL10N(options.title)
    } else {
      options.tipLabel = (options.hasOwnProperty('tipLabel'))
        ? options.localiser.selectL10N(options.tipLabel)
        : options.localiser.localiseUsingDictionary('OverviewMap tipLabel')
    }

    options.layers = []

    super(options)
  }

  setMap (map) {
    if (this.getMap()) {
      this.detachAllListeners()
    }
    super.setMap(map)
    if (map) {
      const view = map.getView()

      const layerConfigs = copyDeep(map.get('layerConfig').layers.filter(l => l.overview))

      for (const options of layerConfigs) {
        const layer = map.get('layerFactory').createLayer(options)
        this.getOverviewMap().addLayer(layer)
        const matchedLayer = map.getLayerGroup().getLayerById(options.id)
        if (options.overview === 'always') {
          layer.setVisible(true)
        } else {
          matchedLayer.on('change:visible', () => {
            layer.setVisible(matchedLayer.getVisible())
          })
        }
      }

      this.listenAt(this.getOverviewMap()).on('click', e => {
        view.setCenter(e.coordinate)
      })

      const $button = this.get$Element().find('button')
      this.listenAt($button).on('click', () => this.dispatchEvent('change:size'))
    }
  }

  afterPositioning () {
    this.getOverviewMap().updateSize()
  }
}
