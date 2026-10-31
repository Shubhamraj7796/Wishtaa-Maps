import { browserCodec } from '@/core/images/codec.browser'
import { rememberChoice, requestChoice } from '@/editor/pictures/flow'
import { useSettings } from '@/stores/settings'
import type { ImportPictures } from './importEmmx'

/** How pictures in an imported .emmx are sized: the person's saved choice, or asked once for the whole file. */
export function importPictures(): ImportPictures {
  return {
    pref: useSettings.getState().picturesPref,
    codec: browserCodec,
    async choose({ count, original, compressed }) {
      const answer = await requestChoice([{ name: `${count} pictures`, original, compressed }])
      if (!answer) return 'original'
      if (answer.remember) rememberChoice(answer.choice)
      return answer.choice
    },
  }
}
