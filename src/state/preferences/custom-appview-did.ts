import {device, useStorage} from '#/storage'

export function useCustomAppViewDid() {
  const [customAppViewDid = false, setCustomAppViewDid] = useStorage(device, [
    'customAppViewDid',
  ])

  return [customAppViewDid, setCustomAppViewDid] as const
}
