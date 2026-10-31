import { describe, expect, it } from 'vitest'
import { SHAPES } from '../model/types'
import { shapeAnchors, shapeGeometry, textArea } from './index'

/**
 * The drawn outline, text area and connection points of every shape, recorded. A change to any shape's drawing shows up
 * here as a diff to review, not as a surprise on someone's map.
 */
describe.each(SHAPES)('shape %s (snapshot)', (id) => {
  it.each([
    [160, 60],
    [100, 100],
  ])('at %i x %i', (w, h) => {
    const g = shapeGeometry(id, w, h, { bw: 2 })
    expect({ outline: g.outline, layers: g.layers, text: textArea(id, w, h), anchors: shapeAnchors(id, w, h) }).toMatchSnapshot()
  })
})

describe('double circle (snapshot)', () => {
  it('draws the inner circle and the outer ring with a gap, for the default and for custom ring settings', () => {
    expect(shapeGeometry('doubleCircle', 120, 120, { bw: 2 })).toMatchSnapshot('default')
    expect(shapeGeometry('doubleCircle', 120, 120, { bw: 2, ringWidth: 10, ringGap: 8 })).toMatchSnapshot('thick ring, wide gap')
  })
})
