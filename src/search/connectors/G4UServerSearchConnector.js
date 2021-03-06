import $ from 'jquery'
import KML from 'ol/format/KML'

import { SearchConnector } from './SearchConnector'

export class G4UServerSearchConnector extends SearchConnector {
  constructor (options) {
    super(options)
    this.serviceURL.url += '/Search/{layerconfigid}/{searchstring}'
    this.format_ = new KML({ showPointNames: false })
  }

  getAutoComplete (input) {
    return this.getSearchResult(input)
    // return new Promise((resolve, reject) => {
    //   let url = expandTemplate(this.autocompleteUrl_, 'searchstring', searchTerm)
    //
    //   $.ajax({
    //     url: this.proxifyUrl(url),
    //     dataType: 'json',
    //     success: results => {
    //       resolve(SearchConnector.flipTuples(results.map(r => [r.name, r])))
    //     },
    //     error: (jqXHR, textStatus) => {
    //       reject(`Problem while trying to get search results from the Server: ${textStatus} -
    //        ${jqXHR.responseText} ` + `(SearchURL: ${url})`)
    //     },
    //     headers: {
    //       'Accept-Language': this.localiser.getCurrentLang()
    //     }
    //   })
    // })
  }

  getSearchResult (input) {
    return new Promise((resolve, reject) => {
      const layerConfigFileName = this.getMap().get('layerConfigFileName')
      const layerConfigId = /.*?(\d+)\/?$/.exec(layerConfigFileName)[1]
      const finalUrl = this.serviceURL.clone()
        .expandTemplate('searchstring', input)
        .expandTemplate('layerconfigid', layerConfigId)
        .finalize()

      $.ajax({
        url: finalUrl,
        dataType: 'text',
        success: results => {
          const features = this.format_.readFeatures(results,
            { dataProjection: 'EPSG:4326', featureProjection: this.featureProjection })
          resolve(SearchConnector.flipTuples(features.map(f => [f.get('extra'), f])))
        },
        error: (jqXHR, textStatus) => {
          reject(new Error(`Problem getting search results from the Server: ${textStatus} - ${jqXHR.responseText} ` +
            `(SearchURL: ${finalUrl})`))
        },
        headers: {
          'Accept-Language': this.localiser.getCurrentLang()
        }
      })
    })
  }

  getByHandle (input) {
    return this.getSearchResult(input).then(([texts, features]) => {
      return features[0]
    })
  }
}
