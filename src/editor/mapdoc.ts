import { createMapDoc } from '@/core/model/doc'

/** The one open map. Kept in its own module so editor code can share it without import cycles. */
export const mapDoc = createMapDoc()
