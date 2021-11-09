/* eslint-disable */
import {
  toPoint
} from 'leaflet/src/geometry/Point'
import {
  toLatLng
} from 'leaflet/src/geo/LatLng'
import {
  Bounds
} from 'leaflet/src/geometry/Bounds'
import {Point} from 'leaflet/src/geometry/Point'
import { toLatLngBounds as latLngBounds } from 'leaflet/src/geo/LatLngBounds'
import * as DomUtil from 'leaflet/src/dom/DomUtil'
import * as Browser from 'leaflet/src/core/Browser'
import * as Util from 'leaflet/src/core/Util'
L.Map.include({
  project: function (latlng, zoom, crs) {
    zoom = zoom === undefined ? this._zoom : zoom
    return crs ? this.options.customCRS[crs].crs.latLngToPoint(toLatLng(latlng), zoom) : this.options.crs.latLngToPoint(toLatLng(latlng), zoom)
  },
  unproject: function (point, zoom, crs) {
    zoom = zoom === undefined ? this._zoom : zoom
    return crs ? this.options.customCRS[crs].crs.pointToLatLng(toPoint(point), zoom) : this.options.crs.pointToLatLng(toPoint(point), zoom)
  },
  getZoomScale: function (toZoom, fromZoom, crsName) {
    var crs = this.options.crs
    fromZoom = fromZoom === undefined ? this._zoom : fromZoom
    if (crsName) {
      const startZoom = this.options.customCRS[crsName].startZoom
      console.log(startZoom)
      toZoom -= this.options.customCRS[crsName].startZoom
      crs = this.options.customCRS[crsName].crs
      fromZoom = fromZoom || this._zoom - this.options.customCRS[crsName].startZoom
    }
    return crs.scale(toZoom) / crs.scale(fromZoom)
  },
  _getNewPixelOrigin: function (center, zoom, crs) {
    var viewHalf = this.getSize()._divideBy(2)
    return this.project(center, zoom, crs)._subtract(viewHalf)._add(this._getMapPanePos())._round()
  },
  _getNewCenter: function (point, zoom, crs) {
    var viewHalf = this.getSize()._divideBy(2)
    return this.unproject(toPoint(point)._subtract(this._getMapPanePos())._add(viewHalf), zoom, crs)
  },
  getPixelOrigin: function (crs) {
    this._checkIfLoaded()
    return crs ? this[crs] : this._pixelOrigin
  },
  _move: function (center, zoom, data) {
    if (zoom === undefined) {
      zoom = this._zoom
    }
    var zoomChanged = this._zoom !== zoom

    this._zoom = zoom
    this._lastCenter = center
    this._pixelOrigin = this._getNewPixelOrigin(center)

    var crss = Object.keys(this.options.customCRS)
    crss.forEach(crs => {
      if (zoom >= this.options.customCRS[crs].startZoom) {
        var tileZoom = zoom - this.options.customCRS[crs].startZoom
        this[crs] = this._getNewPixelOrigin(center, tileZoom, crs)
      }
    })
    // @event zoom: Event
    // Fired repeatedly during any change in zoom level, including zoom
    // and fly animations.
    if (zoomChanged || (data && data.pinch)) { // Always fire 'zoom' if pinching because #3530
      this.fire('zoom', data)
    }

    // @event move: Event
    // Fired repeatedly during any movement of the map, including pan and
    // fly animations.
    return this.fire('move', data)
  }
})
L.GridLayer.include({
  _setView: function (center, zoom, noPrune, noUpdate) {
    var tileZoom = Math.round(zoom)
    if ((this.options.maxZoom !== undefined && tileZoom > this.options.maxZoom) || (this.options.minZoom !== undefined && tileZoom < this.options.minZoom)) {
      tileZoom = undefined
    } else {
      tileZoom = this._clampZoom(tileZoom)
    }
    if (this.options.crs) {
      if (zoom > this._map.options.customCRS[this.options.crs].startZoom) {
        tileZoom -= this._map.options.customCRS[this.options.crs].startZoom
      } else {
        tileZoom = undefined
      }
    }

    var tileZoomChanged = this.options.updateWhenZooming && (tileZoom !== this._tileZoom)

    if (!noUpdate || tileZoomChanged) {
      this._tileZoom = tileZoom

      if (this._abortLoading) {
        this._abortLoading()
      }

      this._updateLevels()
      this._resetGrid()

      if (tileZoom !== undefined) {
        this._update(center)
      }

      if (!noPrune) {
        this._pruneTiles()
      }

      // Flag to prevent _updateOpacity from pruning tiles during
      // a zoom anim or a pinch gesture
      this._noPrune = !!noPrune
    }

    this._setZoomTransforms(center, zoom)
  },
  _update: function (center) {
    var map = this._map
    if (!map) { return }
    var zoom = this._clampZoom(map.getZoom())

    if (center === undefined) { center = map.getCenter() }
    if (this._tileZoom === undefined) { return }	// if out of minzoom/maxzoom

    var pixelBounds = this._getTiledPixelBounds(center),
		    tileRange = this._pxBoundsToTileRange(pixelBounds),
		    tileCenter = tileRange.getCenter(),
		    queue = [],
		    margin = this.options.keepBuffer,
		    noPruneRange = new Bounds(tileRange.getBottomLeft().subtract([margin, -margin]),
		                              tileRange.getTopRight().add([margin, -margin]))

    // Sanity check: panic if the tile range contains Infinity somewhere.
    if (!(isFinite(tileRange.min.x) &&
		      isFinite(tileRange.min.y) &&
		      isFinite(tileRange.max.x) &&
		      isFinite(tileRange.max.y))) { throw new Error('Attempted to load an infinite number of tiles') }

    for (var key in this._tiles) {
      var c = this._tiles[key].coords
      if (c.z !== this._tileZoom || !noPruneRange.contains(new Point(c.x, c.y))) {
        this._tiles[key].current = false
      }
    }

    // _update just loads more tiles. If the tile zoom level differs too much
    // from the map's, let _setView reset levels and prune old tiles.
    // if (Math.abs(zoom - this._tileZoom) > 1) { this._setView(center, zoom); return }

    // create a queue of coordinates to load tiles from
    for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
      for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
        var coords = new Point(i, j)
        coords.z = this._tileZoom

        if (!this._isValidTile(coords)) { continue }

        var tile = this._tiles[this._tileCoordsToKey(coords)]
        if (tile) {
          tile.current = true
        } else {
          queue.push(coords)
        }
      }
    }

    // sort tile queue to load tiles in order of their distance to center
    queue.sort(function (a, b) {
      return a.distanceTo(tileCenter) - b.distanceTo(tileCenter)
    })

    if (queue.length !== 0) {
      // if it's the first batch of tiles to load
      if (!this._loading) {
        this._loading = true
        // @event loading: Event
        // Fired when the grid layer starts loading tiles.
        this.fire('loading')
      }

      // create DOM fragment to append tiles in one batch
      var fragment = document.createDocumentFragment()

      for (i = 0; i < queue.length; i++) {
        this._addTile(queue[i], fragment)
      }

      this._level.el.appendChild(fragment)
    }
  },
  _updateLevels: function () {
    var zoom = this._tileZoom,
      maxZoom = this.options.maxZoom

    function remove (el) {
      var parent = el.parentNode
      if (parent) {
        parent.removeChild(el)
      }
    }
    if (zoom === undefined) {
      return undefined
    }

    for (var z in this._levels) {
      z = Number(z)
      if (this._levels[z].el.children.length || z === zoom) {
        this._levels[z].el.style.zIndex = maxZoom - Math.abs(zoom - z)
        this._onUpdateLevel(z)
      } else {
        remove(this._levels[z].el)
        this._removeTilesAtZoom(z)
        this._onRemoveLevel(z)
        delete this._levels[z]
      }
    }

    var level = this._levels[zoom],
      map = this._map

    if (!level) {
      level = this._levels[zoom] = {}
      level.el = DomUtil.create('div', 'leaflet-tile-container leaflet-zoom-animated', this._container)
      level.el.style.zIndex = maxZoom
      level.origin = map.project(map.unproject(map.getPixelOrigin()), map.getZoom()).round()
      if (this.options.crs) {
        var crs = this.options.crs
        level[crs] = map.project(map.unproject(map.getPixelOrigin(crs), zoom, crs), zoom, crs).round()
        console.log('getPixelOrigin:' + map.getPixelOrigin() + crs + map.getPixelOrigin(crs))
        console.log('origin:' + level.origin + crs + level[crs])
      }
      level.zoom = zoom

      this._setZoomTransform(level, map.getCenter(), map.getZoom())

      // force the browser to consider the newly added element for transition
      Util.falseFn(level.el.offsetWidth)

      this._onCreateLevel(level)
    }

    this._level = level

    return level
  },
  _getTiledPixelBounds: function (center) {
    var map = this._map,
      mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom(),
      scale = map.getZoomScale(mapZoom, this._tileZoom, this.options.crs),
      pixelCenter = map.project(center, this._tileZoom, this.options.crs).floor(),
      halfSize = map.getSize().divideBy(scale * 2)

    return new Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize))
  },
  _getTilePos: function (coords) {
    let origin = this.options.crs ? this._level[this.options.crs] : this._level.origin
    return coords.scaleBy(this.getTileSize()).subtract(origin)
  },
  _isValidTile: function (coords) {
    var crs = this._map.options.crs
    if (this.options.crs) {
      crs = this._map.options.customCRS[this.options.crs].crs
    }
    if (!crs.infinite) {
      // don't load tile if it's out of bounds and not wrapped
      var bounds = this._globalTileRange
      if ((!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x)) ||
        (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))) {
        return false
      }
    }

    if (!this.options.bounds) {
      return true
    }

    // don't load tile if it doesn't intersect the bounds in options
    var tileBounds = this._tileCoordsToBounds(coords)
    return latLngBounds(this.options.bounds).overlaps(tileBounds)
  },
  _setZoomTransform: function (level, center, zoom) {
    // zoom = this.options.minZoom ? zoom - this.options.minZoom : zoom
    var scale = this._map.getZoomScale(zoom, level.zoom, this.options.crs),
      origin = this.options.crs ? level[this.options.crs] : level.origin,
      zoom = this.options.crs ? zoom - this._map.options.customCRS[this.options.crs].startZoom : zoom,
      translate = origin.multiplyBy(scale)
        .subtract(this._map._getNewPixelOrigin(center, zoom, this.options.crs)).round()
    if (Browser.any3d) {
      DomUtil.setTransform(level.el, translate, scale)
    } else {
      DomUtil.setPosition(level.el, translate)
    }
  }
})
