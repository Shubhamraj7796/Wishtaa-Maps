import { createMapDoc, type MapDoc } from '@/core/model/doc'

/** The one open map. Kept in its own module so editor code can share it without import cycles. */
export const mapDoc: MapDoc = createMapDoc()

/** Starts a fresh, empty document in place (every module holds the same object), for opening another file. */
export function resetMapDoc() {
  Object.assign(mapDoc, createMapDoc())
}
