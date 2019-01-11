import $ from 'jquery'
import { get as getProj, transform } from 'ol/proj'
import BaseObject from 'ol/Object'
import Collection from 'ol/Collection'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import { boundingExtent } from 'ol/extent'
import WKT from 'ol/format/WKT'

import { cssClasses, keyCodes } from './globals'
import { Debug } from './Debug'
import { FeatureInteraction } from './interactions/FeatureInteraction'

/**
 * @typedef {object} APIMapInteraction
 * @property {function} cancel ends the interaction. The result promise will not resolve.
 * @property {function} end ends the interaction properly. The result promise will resolve if possible.
 * @property {Promise} result a promise that represents the value of the interaction.
 */

// NOTE:
// Access to a source factory would be nice

/**
 * @typedef {object} APIOptions
 * @property {StyleLike} [drawStyle='#drawStyle']
 */

export class API extends BaseObject {
  /**
   * @param {G4UMap} map
   * @param {object} options
   */
  constructor (map, options = {}) {
    super()

    /**
     * @type {boolean}
     * @private
     */
    this.featureManipulationActive_ = false

    /**
     * @type {StyleLike}
     * @private
     */
    this.drawStyle_ = options.drawStyle || '#drawStyle'

    /**
     * @type {ol.format.WKT}
     * @private
     */
    this.wktParser_ = new WKT()

    /**
     * @type {G4UMap}
     * @private
     */
    this.map_ = map

    /**
     * @type {?ol.interaction.Interaction}
     * @private
     */
    this.featureManipulationInteraction_ = null

    this.map_.once('ready', () => {
      this.layerConfigurator_ = this.map_.get('configurator').layerConfigurator_
    })

    $(this.map_.getViewport()).on('keydown', this.onKeyDown_.bind(this))
  }

  // //////////////  FEATURE MANIPULATION ////////////////

  endFeatureManipulationInternal_ () {
    if (this.featureManipulationInteraction_) {
      this.featureManipulationInteraction_.setActive(false)

      this.map_.removeInteraction(this.featureManipulationInteraction_)
    }

    $(this.map_.getViewport()).removeClass(cssClasses.crosshair)
    $(this.map_.getViewport()).removeClass(cssClasses.arrow)
    // and any other cursor changes

    this.featureManipulationActive_ = false

    this.dispatchEvent('endManipulation')
  }

  /**
   * cancel the current feature manipulation
   */
  cancelFeatureManipulation () {
    if (this.featureManipulationActive_) {
      this.endFeatureManipulationInternal_()
    }
  }

  /**
   * draw a feature
   * @param {object} [options={}]
   * @param {StyleLike} [options.style]
   * @param {string} [options.type='Point'] possible values are: 'Point', 'LineString', 'Polygon', 'MultiPoint',
   *  'MultiLineString', 'MultiPolygon' or 'Circle'
   * @returns {APIMapInteraction}
   */
  drawFeature (options = {}) {
    if (this.featureManipulationActive_) {
      this.endFeatureManipulationInternal_()
    }

    this.featureManipulationActive_ = true

    let collection = new Collection()

    let styleConf = (options.style || this.drawStyle_) || {}

    let style = this.map_.get('styling').getStyle(styleConf)

    this.map_.get('styling').manageFeatureCollection(collection)

    this.featureManipulationInteraction_ = new Draw({
      features: collection,
      type: options.type || 'Point',
      style: style
    })

    this.map_.addSupersedingInteraction('singleclick dblclick pointermove', this.featureManipulationInteraction_)

    $(this.map_.getViewport()).addClass(cssClasses.crosshair)

    return {
      cancel: () => {
        this.endFeatureManipulationInternal_()
      },
      end: () => {
        this.featureManipulationInteraction_.finishDrawing()
        this.endFeatureManipulationInternal_()
      },
      result: new Promise(resolve => {
        this.featureManipulationInteraction_.on('drawend', e => {
          resolve(e.feature)
          this.endFeatureManipulationInternal_()
        })
      })
    }
  }

  fitRectangle (coordinates, opt = {}) {
    if (!opt.hasOwnProperty('srId')) {
      opt.srId = 'EPSG:4326'
    }
    if (!opt.hasOwnProperty('constrainResolution')) {
      opt.constrainResolution = false
    }
    if (!opt.hasOwnProperty('padding')) {
      opt.padding = [0, 0, 0, 0]
    }
    if (getProj(opt.srId)) {
      this.map_.getView().fit(
        boundingExtent(
          [
            transform(
              [parseFloat(coordinates[0][0]), parseFloat(coordinates[0][1])],
              opt.srId,
              this.map_.get('mapProjection').getCode()
            ),
            transform(
              [parseFloat(coordinates[1][0]), parseFloat(coordinates[1][1])],
              opt.srId,
              this.map_.get('mapProjection').getCode()
            )
          ]
        ),
        opt
      )
    } else {
      Debug.error(`Unknown Projection '${opt.srId}'`)
    }
  }

  setVisibleLayer (id) {
    this.map_.getLayerGroup().recursiveForEach((layer) => {
      if (layer.get('id')) {
        layer.setVisible(true)
      }
    })
  }

  onKeyDown_ (e) {
    if (this.featureManipulationActive_ && e.which === keyCodes.ESCAPE) {
      this.endFeatureManipulationInternal_()
    }
  }

  /**
   * Select a feature with a single click
   * @returns {APIMapInteraction}
   */
  selectFeature () {
    if (this.featureManipulationActive_) {
      this.endFeatureManipulationInternal_(null)
    }

    this.featureManipulationActive_ = true

    this.featureManipulationInteraction_ = new FeatureInteraction({
      type: 'singleclick'
    })

    this.map_.addSupersedingInteraction('singleclick', this.featureManipulationInteraction_)

    $(this.map_.getViewport()).addClass(cssClasses.arrow)

    return {
      cancel: () => {
        this.endFeatureManipulationInternal_()
      },
      end: () => {
        this.endFeatureManipulationInternal_()
      },
      result: new Promise((resolve) => {
        this.featureManipulationInteraction_.on('interaction', e => {
          if (e.interacted.length) {
            resolve(e.interacted[0].feature, e.interacted[0].layer)
            this.endFeatureManipulationInternal_()
          }
        })
      })
    }
  }

  /**
   * Modify a given Feature. The end function needs to be called to indicate that a modifying process is completed.
   * @param {ol.Collection<ol.Feature>|ol.Feature[]|ol.Feature} feature
   * @param {Object} options
   * @param {StyleLike} [options.style]
   * @returns {APIMapInteraction}
   */
  modifyFeature (feature, options = {}) {
    options.features = new Collection([feature])

    if (this.featureManipulationActive_) {
      this.endFeatureManipulationInternal_(false)
    }

    this.featureManipulationActive_ = true

    if (options.style) {
      options.style = this.map_.get('styling').getStyle(options.style)
    }

    this.featureManipulationInteraction_ = new Modify(options)

    this.map_.addSupersedingInteraction('singleclick dblclick pointermove', this.featureManipulationInteraction_)

    $(this.map_.getViewport()).addClass(cssClasses.crosshair)

    let ended = false

    return {
      cancel: () => {
        this.endFeatureManipulationInternal_()
      },
      end: () => {
        ended = true
        this.endFeatureManipulationInternal_()
      },
      result: new Promise(resolve => {
        this.featureManipulationInteraction_.on('modifyend', () => {
          if (ended) {
            resolve(feature)
          }
        })

        this.featureManipulationInteraction_.once('change:active', () => {
          if (ended) {
            resolve(feature)
          }
        })
      })
    }
  }

  /**
   * This function creates a layer from the given layerOptions and adds it the map
   * @param {g4uLayerOptions} layerOptions
   * @param {boolean} [atBottom=false] specifies if layer is added at bottom or top
   * @returns {VectorLayer}
   */
  addLayer (layerOptions, atBottom = false) {
    const layer = this.layerConfigurator_.getFactory().createLayer(layerOptions)
    if (!atBottom) {
      this.map_.addLayer(layer)
    } else {
      this.map_.getLayers().insertAt(0, layer)
    }
  }

  /**
   * This function creates a layer from the given layerOptions, adds it as a VectorLayere and returns a promise which
   * is resolved as soon as the layer is loaded fully.
   * @param {g4uLayerOptions} layerOptions
   * @returns {Promise.<VectorLayer>}
   */
  loadLayerFromServer (layerOptions) {
    layerOptions = layerOptions || {}
    layerOptions.visible = true
    layerOptions.source = layerOptions.source || {}

    let promise = new Promise((resolve, reject) => {
      let layer = this.addLayer(layerOptions)
      let source = layer.getSource()
      let loadEndHandler = () => {
        source.un('vectorloadend', loadErrorHandler)
        resolve(layer)
      }
      let loadErrorHandler = () => {
        source.un('vectorloaderror', loadEndHandler)
        reject(new Error('vector load error'))
      }
      source.once('vectorloadend', loadEndHandler)
      source.once('vectorloaderror', loadErrorHandler)
    })

    return promise
  }

  /**
   * Creates a Feature from the given config
   * @param {FeatureConfig} config
   * @returns {ol.Feature}
   */
  createFeature (config) {
    return this.layerConfigurator_.getFactory().createFeature(config)
  }

  /**
   * Removes a layer from the map
   * @param {ol.layer.Base} layer
   */
  removeLayer (layer) {
    this.map_.getLayerGroup().removeLayer(layer)
  }
}
