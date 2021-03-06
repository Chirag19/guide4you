import $ from 'jquery'
import { concat, difference, intersection } from 'lodash/array'
import { isEmpty } from 'lodash/lang'
import ImageWMS from 'ol/source/ImageWMS'
import TileWMS from 'ol/source/TileWMS'

import { asyncImageLoad, mixin } from '../utilities'
import { Debug } from '../Debug'

/**
 * @typedef {object} WMSFeatureInfoOptions
 * @property {object.<string, string>} [params] the params to be used with the GetFeatureInfo call.
 *    Needs to include INFO_FORMAT.
 *    If the layer does not use the buttons options than needs to include QUERY_LAYERS.
 * @property {boolean} [checkable=false] If the layer does not use the buttons options, this options specifies if an
 *    extra button on the layer button appears to toggle the feature info.
 * @property {boolean} [checked=true] If the layer does not use the buttons options and checkable is true, this option
 *    specifies if the feature info button appears activated or not.
 * @property {[number, number]} [iframe=false] load in iframe of this size
 */

export class WMSMixin {
  /**
   * @param {object} options
   * @param {WMSFeatureInfoOptions} options.featureInfo
   */
  initialize (options) {
    this.featureInfo_ = options.featureInfo !== undefined
    this.featureInfoParams_ = {
      QUERY_LAYERS: []
    }

    if (this.featureInfo_) {
      this.featureInfoIframe = options.featureInfo.iframe
      Object.assign(this.featureInfoParams_, options.featureInfo.params)
      this.featureInfoMutators_ = options.featureInfo.mutators
    }

    if (!this.getParams().LAYERS) {
      this.updateParams({
        LAYERS: []
      })
    }

    this.set('legends', options.legends || false)
  }

  getQueryable () {
    return this.featureInfo_ && this.featureInfoParams_.QUERY_LAYERS &&
      this.featureInfoParams_.QUERY_LAYERS.length > 0 &&
      intersection(this.featureInfoParams_.QUERY_LAYERS, this.getParams().LAYERS).length > 0
  }

  getFeatureInfoMutators () {
    return this.featureInfoMutators_ || []
  }

  hasFeatureInfo () {
    return this.featureInfo_
  }

  activateLayers (layers) {
    this.updateParams({
      LAYERS: concat(this.getParams().LAYERS, layers)
    })
    this.dispatchEvent('change:layers')
  }

  deactivateLayers (layers) {
    this.updateParams({
      LAYERS: difference(this.getParams().LAYERS, layers)
    })
    this.dispatchEvent('change:layers')
  }

  areLayersActive (layers) {
    return isEmpty(difference(layers, this.getParams().LAYERS))
  }

  anyLayerActive () {
    return !isEmpty(this.getParams().LAYERS)
  }

  activateQueryLayers (layers) {
    this.updateFeatureInfoParams({
      QUERY_LAYERS: concat(this.getFeatureInfoParams().QUERY_LAYERS, layers)
    })
    this.dispatchEvent('change:queryLayers')
  }

  deactivateQueryLayers (layers) {
    this.updateFeatureInfoParams({
      QUERY_LAYERS: difference(this.getFeatureInfoParams().QUERY_LAYERS, layers)
    })
    this.dispatchEvent('change:queryLayers')
  }

  areQueryLayersActive (layers) {
    return isEmpty(difference(layers, this.getFeatureInfoParams().QUERY_LAYERS))
  }

  getFeatureInfoParams () {
    return this.featureInfoParams_
  }

  updateFeatureInfoParams (newParams) {
    Object.assign(this.featureInfoParams_, newParams)
    this.changed()
  }

  getFeatureInfo (coordinate, resolution, projection) {
    return new Promise((resolve, reject) => {
      const params = Object.assign({}, this.featureInfoParams_)
      if (!params.QUERY_LAYERS) {
        resolve(undefined)
      }
      params.QUERY_LAYERS = intersection(params.QUERY_LAYERS, this.getParams().LAYERS)
      if (params.QUERY_LAYERS.length === 0) {
        resolve(undefined)
      } else {
        const gfiExt = this.getFeatureInfoUrl(coordinate, resolution, projection, params).slice(1)
        const url = this.originalUrlObject.extend(gfiExt).finalize()
        if (this.featureInfoIframe) {
          resolve($('<iframe>')
            .width(this.featureInfoIframe[0])
            .height(this.featureInfoIframe[1])
            .attr('src', url))
        } else {
          $.ajax({
            url,
            success: resolve,
            error: reject,
            dataType: 'text'
          })
        }
      }
    })
  }

  // toggleArrayEntries_ (obj, prop, names, toggle) {
  //   let arr = obj[prop] || []
  //   if (toggle) {
  //     // the call of toggleWMSLayers in TemplatePrintControl causes an polyfill error in
  //     // internet explorer / microsoft edge related to Symbol.iterator which is used for
  //     // the for-of loop
  //     names.forEach(name => {
  //       if (arr.indexOf(name) < 0) {
  //         arr.push(name)
  //       }
  //     })
  //     // for (let name of names) {
  //     //   if (arr.indexOf(name) < 0) {
  //     //     arr.push(name)
  //     //   }
  //     // }
  //   } else {
  //     for (let name of names) {
  //       let index = arr.indexOf(name)
  //       if (index >= 0) {
  //         arr.splice(index, 1)
  //       }
  //     }
  //   }
  //   obj[prop] = arr
  //   return obj
  // }
  //
  // toggleWMSLayers (names, toggle) {
  //   this.updateParams(this.toggleArrayEntries_(this.getParams(), 'LAYERS', names, toggle))
  // }
  //
  // toggleWMSQueryLayers (names, toggle) {
  //   this.updateFeatureInfoParams(this.toggleArrayEntries_(this.featureInfoParams_, 'QUERY_LAYERS', names, toggle))
  // }
  //
  // arrayContainsAll (arr, contains) {
  //   return contains.every(needle => arr.indexOf(needle) >= 0)
  // }
  //
  // getWMSLayersVisible (names) {
  //   return this.arrayContainsAll(this.getParams().LAYERS || [], names)
  // }
  //
  // getWMSQueryLayersVisible (names) {
  //   return this.arrayContainsAll(this.featureInfoParams_.QUERY_LAYERS || [], names)
  // }

  // TODO: remove with ol version 6
  getGetLegendGraphicUrl (resolution, layer) {
    const params = Object.assign({}, this.getParams())

    const baseParams = {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetLegendGraphic',
      FORMAT: 'image/png',
      LAYER: layer
    }

    if (resolution !== undefined) {
      const mpu = this.getProjection() ? this.getProjection().getMetersPerUnit() : 1
      const dpi = 25.4 / 0.28
      const inchesPerMeter = 39.37
      baseParams.SCALE = resolution * mpu * inchesPerMeter * dpi
    }

    Object.assign(baseParams, params)

    const url = this.originalUrlObject.clone()

    // Skip any null or undefined parameter values
    Object.keys(baseParams).forEach(k => {
      if (baseParams[k] !== null && baseParams[k] !== undefined) {
        url.addParam(k + '=' + encodeURIComponent(baseParams[k]))
      }
    })

    return url.finalize()
  }
}

/**
 * A wms source config.
 * @typedef {SourceConfig} WMSSSourceConfig
 * @property {object} params required. needs to contain a `LAYERS` parameter. For other
 *    parameters see: http://openlayers.org/en/latest/apidoc/ol.source.ImageWMS.html -> Constructor options -> params
 * @property {WMSFeatureInfoOptions} featureInfo
 */

export class ImageWMSSource extends mixin(ImageWMS, WMSMixin) {
  constructor (options) {
    const originalUrl = options.url
    options.url = '_' // dummy value that gets sliced out
    options.imageLoadFunction = (image, src) => {
      asyncImageLoad(image.getImage(), this.originalUrlObject.extend(src.slice(1)))
        .catch(err => Debug.error(err))
    }
    super(options)
    this.originalUrlObject = originalUrl
  }
}

export class TileWMSSource extends mixin(TileWMS, WMSMixin) {
  constructor (options) {
    const origUrl = options.url
    options.url = '_' // dummy value that gets sliced out
    options.tileLoadFunction = (tile, src) => {
      asyncImageLoad(tile.getImage(), this.originalUrlObject.extend(src.slice(1)))
        .catch(err => Debug.error(err))
    }
    super(options)
    this.originalUrlObject = origUrl
  }
}
