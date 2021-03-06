import OlClusterSource from 'ol/source/Cluster'

import { Debug } from '../Debug'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { getCenter } from 'ol/extent'
import Polygon from 'ol/geom/Polygon'
import Circle from 'ol/geom/Circle'

export class ClusterSource extends OlClusterSource {
  /**
   * @param {ol.source.Vector} source
   * @param {olx.} options
   */
  constructor (source, options) {
    options.source = source
    options.geometryFunction = options.geometryFunction || ClusterSource.defaultGeometryFunction
    super(options)
  }

  static defaultGeometryFunction (feature) {
    const geom = feature.getGeometry()
    if (geom instanceof Point) {
      return geom
    } else if (geom instanceof LineString || geom instanceof Polygon) {
      return new Point(getCenter(geom.getExtent()))
    } else if (geom instanceof Circle) {
      return new Point(geom.getCenter())
    } else {
      Debug.warn('Trying to cluster unsupported geometry type.')
      return null
    }
  }
}
