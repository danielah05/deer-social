import React from 'react'

import * as persisted from '#/state/persisted'

type StateContext = persisted.Schema['deerVerification']
type SetContext = (v: persisted.Schema['deerVerification']) => void

const stateContext = React.createContext<StateContext>(
  persisted.defaults.deerVerification,
)
const setContext = React.createContext<SetContext>(
  (_: persisted.Schema['deerVerification']) => {},
)

export function Provider({children}: React.PropsWithChildren<{}>) {
  const [state, setState] = React.useState(persisted.get('deerVerification'))

  const setStateWrapped = React.useCallback(
    (deerVerification: persisted.Schema['deerVerification']) => {
      setState(deerVerification)
      persisted.write('deerVerification', deerVerification)
    },
    [setState],
  )

  React.useEffect(() => {
    return persisted.onUpdate('deerVerification', nextDeerVerification => {
      setState(nextDeerVerification)
    })
  }, [setStateWrapped])

  return (
    <stateContext.Provider value={state}>
      <setContext.Provider value={setStateWrapped}>
        {children}
      </setContext.Provider>
    </stateContext.Provider>
  )
}

export function useDeerVerification() {
  return React.useContext(stateContext) ?? persisted.defaults.deerVerification!
}

export function useDeerVerificationEnabled() {
  return useDeerVerification().enabled
}

export function useDeerVerificationTrusted(
  mandatory: string | undefined = undefined,
) {
  const trusted = new Set(useDeerVerification().trusted)
  if (mandatory) {
    trusted.add(mandatory)
  }
  return trusted
}

export function useSetDeerVerification() {
  return React.useContext(setContext)
}

export function useSetDeerVerificationEnabled() {
  const deerVerification = useDeerVerification()
  const setDeerVerification = useSetDeerVerification()

  return React.useMemo(
    () => (enabled: boolean) =>
      setDeerVerification({...deerVerification, enabled}),
    [deerVerification, setDeerVerification],
  )
}

export function useSetDeerVerificationTrust() {
  const deerVerification = useDeerVerification()
  const setDeerVerification = useSetDeerVerification()

  return React.useMemo(
    () => ({
      add: (add: string) => {
        const trusted = new Set(deerVerification.trusted)
        trusted.add(add)
        setDeerVerification({...deerVerification, trusted: Array.from(trusted)})
      },
      remove: (remove: string) => {
        const trusted = new Set(deerVerification.trusted)
        trusted.delete(remove)
        setDeerVerification({...deerVerification, trusted: Array.from(trusted)})
      },
    }),
    [deerVerification, setDeerVerification],
  )
}
