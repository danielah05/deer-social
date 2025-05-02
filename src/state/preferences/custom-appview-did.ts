import {device, useStorage} from '#/storage'

export function useCustomAppViewDid() {
  const [customAppViewDid = undefined, setCustomAppViewDid] = useStorage(
    device,
    ['customAppViewDid'],
  )

  return [customAppViewDid, setCustomAppViewDid] as const
}
