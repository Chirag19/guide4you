import { Debug } from '../../Debug'
import { get as getProj, transform } from 'ol/proj'

/**
 * @type {URLParameter}
 */
export const fitRectangleParam = {
  keys: ['x0', 'y0', 'x1', 'y1', 'srid', 'pad'],
  setEvent: 'afterConfiguring',
  setToMap: (map, query) => {
    if (query.isSet('x0') && query.isSet('y0') && query.isSet('x1') && query.isSet('y1')) {
      const x0 = parseFloat(query.getSanitizedVal('x0'))
      const y0 = parseFloat(query.getSanitizedVal('y0'))
      const x1 = parseFloat(query.getSanitizedVal('x1'))
      const y1 = parseFloat(query.getSanitizedVal('y1'))
      if (!isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
        const options = {}
        if (query.isSet('srid')) {
          const srId = query.getSanitizedVal('srid')
          if (getProj(srId)) {
            options.srId = srId
          } else {
            Debug.error(`Unknown Projection '${srId}'`)
          }
        } else {
          options.srId = map.get('interfaceProjection')
        }
        if (query.isSet('pad')) {
          const p = parseFloat(query.getSanitizedVal('pad'))
          options.padding = [p, p, p, p]
        }

        map.get('api').fitRectangle([[x0, y0], [x1, y1]], options)
      }
    }
  },
  getFromMap: (map, query) => {
    const view = map.getView()
    const coordinate = transform(
      view.getCenter(),
      view.getProjection(),
      map.get('interfaceProjection')
    )

    if (!query.isExcluded('center')) {
      return {
        x: coordinate[0].toFixed(5),
        y: coordinate[1].toFixed(5),
        srid: map.get('interfaceProjection')
      }
    }
  }
}
