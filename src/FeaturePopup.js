import $ from 'jquery'
import flatten from 'lodash/flatten'
import { getCenter } from 'ol/extent'
import Point from 'ol/geom/Point'
import BaseObject from 'ol/Object'
import Overlay from 'ol/Overlay'
import Icon from 'ol/style/Icon'

import { ListenerOrganizerMixin } from './ListenerOrganizerMixin'
import { Window } from './html/Window'
import { cssClasses } from './globals'
import { finishAllImages, mixin } from './utilities'

import '../less/featurepopup.less'

/**
 * @typedef {object} FeaturePopupOptions
 * @property {string} [className='g4u-featurepopup']
 * @property {number[]} [offset=[0,0]]
 * @property {OverlayPositioning} [positioning='center-center']
 * @property {number[]} [iconSizedOffset=[0,0]]
 * @property {boolean} [centerOnPopup=false]
 * @property {boolean} [animated=true]
 * @property {string[]} [popupModifier] default popupModifiers to use
 * @property {boolean} [draggable=false]
 */

/**
 * Displays a Popup bound to a geographical position via an ol.Overlay
 */
export class FeaturePopup extends mixin(BaseObject, ListenerOrganizerMixin) {
  /**
   * @param {FeaturePopupOptions} options
   */
  constructor (options = {}) {
    super()

    /**
     * @type {string}
     * @private
     */
    this.className_ = (options.hasOwnProperty('className')) ? options.className : 'g4u-featurepopup'

    /**
     * @type {string}
     * @private
     */
    this.classNameFeatureName_ = this.className_ + '-feature-name'

    /**
     * @type {string}
     * @private
     */
    this.classNameFeatureDescription_ = this.className_ + '-feature-description'

    /**
     * @type {jQuery}
     * @private
     */
    this.$name_ = $('<h3>').addClass(this.classNameFeatureName_)

    /**
     * @type {jQuery}
     * @private
     */
    this.$description_ = $('<p>').addClass(this.classNameFeatureDescription_)

    /**
     * @type {null|ol.Feature}
     * @private
     */
    this.feature_ = null

    /**
     * @type {boolean}
     * @private
     */
    this.visible_ = false

    /**
     * @type {VectorLayer[]}
     * @private
     */
    this.referencingVisibleLayers_ = []

    /**
     * @type {number[]}
     * @private
     */
    this.pixelOffset_ = options.hasOwnProperty('offset') ? options.offset : [0, 0]

    /**
     * @type {number[]}
     * @private
     */
    this.iconSizedOffset_ = options.hasOwnProperty('iconSizedOffset') ? options.iconSizedOffset : [0, 0]

    /**
     * @type {boolean}
     * @private
     */
    this.centerOnPopup_ = options.hasOwnProperty('centerOnPopup') ? options.centerOnPopup : true

    /**
     * @type {boolean}
     * @private
     */
    this.centerOnPopupInitial_ = this.centerOnPopup_

    /**
     * @type {boolean}
     * @private
     */
    this.animated_ = options.hasOwnProperty('animated') ? options.animated : true

    /**
     * @type {jQuery}
     * @private
     */
    this.$element_ = $('<div>').addClass(this.className_).addClass(cssClasses.hidden)

    /**
     * @type {ol.Overlay}
     * @private
     */
    this.overlay_ = new Overlay({
      element: this.$element_.get(0),
      offset: this.pixelOffset_,
      positioning: options.hasOwnProperty('positioning') ? options.positioning : 'center-center',
      stopEvent: true
    })

    /**
     * @type {string[]}
     * @private
     */
    this.defaultPopupModifiers_ = options.popupModifier || []

    /**
     * @type {boolean}
     * @private
     */
    this.draggable_ = options.draggable || false

    /**
     * @type {string[]}
     * @private
     */
    this.currentPopupModifiers_ = []

    /**
     * @type {?Window}
     * @private
     */
    this.window_ = null

    /**
     * @type {?G4UMap}
     * @private
     */
    this.map__ = null
  }

  /**
   * @param {ol.Feature} feature
   * @returns {boolean}
   */
  static canDisplay (feature) {
    if (feature.get('features') && feature.get('features').length === 1) {
      feature = feature.get('features')[0]
    }
    return !feature.get('disabled') && (feature.get('name') ||
      (feature.get('description') && $('<span>').html(feature.get('description')).text().match(/\S/)))
  }

  /**
   * @param {G4UMap} map
   */
  setMap (map) {
    if (this.getMap()) {
      this.detachAllListeners()
      this.getMap().removeOverlay(this.overlay_)
    }

    if (map) {
      this.window_ = new Window({
        parentClassName: this.className_,
        draggable: this.draggable_,
        fixedPosition: true,
        map: map
      })

      this.window_.get$Body().append(this.$name_).append(this.$description_)

      this.listenAt(this.window_).on('change:visible', () => {
        if (!this.window_.getVisible()) {
          this.setVisible(false) // notifying the featurepopup about the closing of the window
        }
      })

      this.$element_.append(this.window_.get$Element())

      // feature click

      this.listenAt(map.get('clickInteraction')).on('interaction', e => {
        const interacted = e.interacted.filter(({ feature }) => FeaturePopup.canDisplay(feature))
        if (interacted.length) {
          const { feature, layer } = interacted[0]
          this.onFeatureClick_(feature, layer, e.coordinate)
        }
      })

      // clickable
      map.get('clickableInteraction').addFilter(e => {
        return map.forEachFeatureAtPixel(e.pixel, FeaturePopup.canDisplay)
      })

      // hiding feature Popup if the layer gets hidden or the feature gets removed

      const forEachSource = (layer, source) => {
        if (source.getFeatures) {
          this.listenAt(source).on('removefeature', e => {
            if (e.feature === this.getFeature()) {
              for (const rLay of this.referencingVisibleLayers_) {
                if (rLay.getSource() === source) {
                  this.removeReferencingLayer_(rLay)
                }
              }
            }
          })
        }
      }

      const forEachLayer = layer => {
        if (layer.getSource) {
          const source = layer.getSource()

          if (source) {
            forEachSource(layer, source)
          }

          this.listenAt(layer).on('change:source', e => {
            this.detachFrom(e.oldValue)
            forEachSource(layer, layer.getSource())
          })

          this.listenAt(layer).on('change:visible', () => {
            if (layer.getVisible()) {
              if (this.layerContainsFeature(layer, this.getFeature())) {
                this.addReferencingLayer_(layer)
              }
            } else {
              this.removeReferencingLayer_(layer)
            }
          })
        }

        if (layer.getLayers) {
          layer.getLayers().forEach(forEachLayer)
          this.listenAt(layer.getLayers())
            .on('add', e => {
              forEachLayer(e.element)
            })
            .on('remove', e => {
              if (e.element.getSource && e.element.getSource()) {
                this.detachFrom(e.element.getSource())
              }
              this.detachFrom(e.element)
            })
        }
      }

      forEachLayer(map.getLayerGroup())

      map.addOverlay(this.overlay_)

      this.$element_.parent().addClass(this.className_ + '-container')

      const onMapChangeMobile = () => {
        if (map.get('mobile')) {
          this.centerOnPopup_ = false
        } else {
          this.centerOnPopup_ = this.centerOnPopupInitial_
        }
      }

      onMapChangeMobile()
      this.listenAt(map).on('change:mobile', onMapChangeMobile)

      // limiting size

      map.once('postrender', () => {
        this.window_.updateSize()
      })
    }

    this.map__ = map
  }

  /**
   * @param {ol.Feature} feature
   * @param {ol.layer.Vector} layer
   * @param {ol.Coordinate} coordinate
   * @private
   */
  onFeatureClick_ (feature, layer, coordinate = null) {
    if (this.getFeature() === feature) {
      this.setVisible(false)
      this.setFeature(null)
    } else {
      if (feature.get('features')) {
        feature = feature.get('features')[0]
      }

      this.setFeature(feature, layer, feature.getStyle() || layer.getStyle(), coordinate)
      this.setVisible(true)

      if (this.centerOnPopup_) {
        this.centerMapOnPopup()
      }
    }
  }

  /**
   * @param {VectorLayer} layer
   * @private
   */
  removeReferencingLayer_ (layer) {
    const index = this.referencingVisibleLayers_.indexOf(layer)
    if (index > -1) {
      this.referencingVisibleLayers_.splice(index, 1)
      if (this.referencingVisibleLayers_.length === 0) {
        this.setVisible(false)
      }
    }
  }

  /**
   * @returns {G4UMap}
   */
  getMap () {
    return this.map__
  }

  /**
   * @returns {null|ol.Feature}
   */
  getFeature () {
    return this.feature_
  }

  /**
   * @returns {Array|VectorLayer[]}
   */
  getLayers () {
    return this.referencingVisibleLayers_
  }

  updateContent () {
    if (this.getMap().get('localiser').isRtl()) {
      this.window_.get$Body().prop('dir', 'rtl')
    } else {
      this.window_.get$Body().prop('dir', undefined)
    }

    return this.getMap().get('popupModifiers').apply({
      name: this.getFeature().get('name'),
      description: this.getFeature().get('description')
    }, this.getMap(), this.currentPopupModifiers_)
      .then(result => {
        if (result.name) {
          this.$name_.removeClass(cssClasses.hidden)
          this.$name_.html(result.name)
        } else {
          this.$name_.addClass(cssClasses.hidden)
        }

        if (result.description) {
          this.$description_.removeClass(cssClasses.hidden)
          this.$description_.html(result.description)
        } else {
          this.$description_.addClass(cssClasses.hidden)
        }

        this.dispatchEvent('update:content')
        return finishAllImages(this.$description_)
      })
      .then(() => {
        this.updateSize()
      })
  }

  /**
   * Update the Popup. Call this if something in the feature has changed
   */
  update (style) {
    const feature = this.getFeature()
    if (feature) {
      this.$name_.empty()
      this.$description_.empty()

      // this produces one unnecessary call to window.updateSize()
      this.updateContent().then(() => {
        if (!feature.get('observedByPopup')) {
          feature.on('change:name', () => this.updateContent())
          feature.on('change:description', () => this.updateContent())
          feature.set('observedByPopup', true)
        }

        this.once('change:feature', () => {
          feature.un('change:name', () => this.updateContent())
          feature.un('change:description', () => this.updateContent())
          feature.set('observedByPopup', false)
        })

        if (!this.getMap().get('mobile')) {
          const resolution = this.getMap().getView().getResolution()

          this.addIconSizedOffset(feature, style, resolution)
        }

        for (const layer of this.referencingVisibleLayers_) {
          if (layer.get('addClass')) {
            this.window_.get$Element().addClass(layer.get('addClass'))
          }
        }

        // apply default offset

        if (this.getVisible()) {
          setTimeout(() => this.window_.updateSize(), 0)
        }
      })
    }
  }

  updateSize () {
    if (this.getVisible() && this.window_ && this.window_.updateSize) {
      this.window_.updateSize()
    }
  }

  /**
   * The feature should have a property 'name' and/or 'description' to be shown inside of the popup.
   * @param {ol.Feature} feature
   * @param {ol.layer.Base} layer
   * @param {ol.style.Style} style
   * @param {ol.Coordinate} clickCoordinate
   * @param {string[]} [optPopupModifiers=[]]
   */
  setFeature (feature, layer, style, clickCoordinate = null) {
    const oldValue = this.feature_
    if (feature) {
      let coordinate = clickCoordinate
      if (feature.get('origCoords') !== undefined) {
        coordinate = feature.get('origCoords')
      } else if (feature.getGeometry() instanceof Point || !clickCoordinate) {
        coordinate = getCenter(feature.getGeometry().getExtent())
      }
      this.overlay_.setPosition(coordinate)
    }

    if (oldValue !== feature) {
      if (this.feature_) {
        this.feature_.un('change:geometry', this.geometryChangeHandler_)
      }
      this.feature_ = feature

      this.referencingVisibleLayers_ = []

      if (layer) {
        this.addReferencingLayer_(layer)
      }

      this.getMap().getLayerGroup().recursiveForEach(layer => {
        if (this.layerContainsFeature(layer, feature)) {
          this.addReferencingLayer_(layer)
        }
      })

      this.currentPopupModifiers_ = this.defaultPopupModifiers_.slice()
      for (const refLayer of this.referencingVisibleLayers_) {
        this.currentPopupModifiers_ = this.currentPopupModifiers_.concat(flatten(refLayer.get('popupModifiers')))
      }

      if (this.feature_) {
        this.geometryChangeHandler_ = () => {
          let coordinate = clickCoordinate
          if (feature.getGeometry() instanceof Point || !clickCoordinate) {
            coordinate = getCenter(feature.getGeometry().getExtent())
          }
          this.overlay_.setPosition(coordinate)
          if (this.getVisible()) {
            this.update(style)
          }
        }
        this.feature_.on('change:geometry', this.geometryChangeHandler_)
      }

      this.dispatchEvent({
        type: 'change:feature',
        oldValue: oldValue,
        key: 'feature'
      })

      this.update(style)
    }
  }

  layerContainsFeature (layer, feature) {
    const source = layer.getSource && layer.getSource()
    if (source && source.getFeatures) {
      return source.getFeatures().indexOf(feature) > -1
    }
    return false
  }

  /**
   * @returns {boolean}
   */
  getVisible () {
    return this.visible_
  }

  /**
   * @param {boolean} visible
   */
  setVisible (visible) {
    const oldValue = this.visible_
    if (oldValue !== visible) {
      this.visible_ = visible

      if (visible === true && this.getFeature()) {
        this.$element_.removeClass(cssClasses.hidden)
        this.window_.setVisible(true)
      } else {
        this.$element_.addClass(cssClasses.hidden)
        this.window_.setVisible(false)
        this.window_.resetDragged()
      }

      if (!visible) {
        this.setFeature(null)
      }

      this.dispatchEvent({
        type: 'change:visible',
        oldValue: oldValue,
        key: 'visible'
      })
    }

    if (visible) {
      setTimeout(() => this.window_.updateSize(), 0)
    }
  }

  /**
   * calculates iconSized Offset and applies it
   * @param {ol.Feature} feature
   * @param {ol.style.Style} style
   * @param {number} resolution
   */

  addIconSizedOffset (feature, style, resolution) {
    if (this.iconSizedOffset_[0] !== 0 || this.iconSizedOffset_[1] !== 0) {
      if (style) {
        style = this.getMap().get('styling').manifestStyle(style, feature, resolution)
        if (style) {
          const imageStyle = style.getImage()
          if (imageStyle instanceof Icon) {
            (new Promise(resolve => {
              const img = imageStyle.getImage()
              if (img.complete && img.src) {
                resolve()
              } else {
                img.addEventListener('load', () => {
                  this.getMap().render() // initiate styles with size and anchor
                  this.getMap().once('postcompose', resolve)
                })
                imageStyle.load()
              }
            })).then(() => {
              const iconSize = imageStyle.getSize()

              const totalOffset = [
                this.pixelOffset_[0] + this.iconSizedOffset_[0] * iconSize[0] * (imageStyle.getScale() || 1),
                this.pixelOffset_[1] + this.iconSizedOffset_[1] * iconSize[1] * (imageStyle.getScale() || 1)
              ]

              this.overlay_.setOffset(totalOffset)
            })
          }
        }
      }
    }
  }

  /**
   * Centers the map on the popup after all images have been loaded
   */
  centerMapOnPopup (animated) {
    animated = animated === undefined ? this.animated_ : animated

    const _centerMap = () => {
      this.window_.updateSize()
      this.getMap().get('move').toPoint(this.getCenter(), { animated })
    }

    finishAllImages(this.window_.get$Body()).then(() => {
      // we need to do this trick to find out if map is already visible/started rendering
      if (this.getMap().getPixelFromCoordinate([0, 0])) {
        _centerMap()
      } else {
        this.getMap().once('postrender', _centerMap)
      }
    })
  }

  /**
   * calculates Center of the Popup. Be careful, this calculation repositions the popup to calculate the center
   * properly and repostions to the initial Position again.
   * This does only work if the popup is already visible!
   * @returns {ol.Coordinate}
   */
  getCenter () {
    const offset = this.overlay_.getOffset()

    const pixelPosition = this.getMap().getPixelFromCoordinate(this.overlay_.getPosition())

    // apply offset
    pixelPosition[0] += offset[0]
    pixelPosition[1] += offset[1]

    // applay width/height depending on positioning
    const positioning = this.overlay_.getPositioning().split('-')

    const width = this.$element_.outerWidth()
    const height = this.$element_.outerHeight()

    if (positioning[1] === 'left') {
      pixelPosition[0] += width / 2
    }
    if (positioning[1] === 'right') {
      pixelPosition[0] -= width / 2
    }

    if (positioning[0] === 'top') {
      pixelPosition[1] += height / 2
    }
    if (positioning[0] === 'bottom') {
      pixelPosition[1] -= height / 2
    }

    return this.getMap().getCoordinateFromPixel(pixelPosition)
  }

  addReferencingLayer_ (layer) {
    if (this.referencingVisibleLayers_.indexOf(layer) < 0) {
      this.referencingVisibleLayers_.push(layer)
    }
  }
}
