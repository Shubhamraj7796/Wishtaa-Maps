import { pictureIdOf } from './sha256'

/**
 * A picture downloaded from Drive is only used if its bytes still match its id (its content hash). A damaged or swapped file is
 * rejected, never shown. Ids that are not content hashes (older pictures) cannot be checked and are accepted.
 */
export async function matchesId(id: string, blob: Blob): Promise<boolean> {
  if (!id.startsWith('p-')) return true
  return (await pictureIdOf(blob)) === id
}
