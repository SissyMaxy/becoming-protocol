// Mount at the app root to enable the panic-corner gesture.
// 5-second long-press in the top-right 80px square fires a hard reset with
// `via: 'panic_gesture'` (no confirmation modal, but the edge fn still
// enforces stealth PIN if configured).
//
// Only enabled when the user is signed in. Calling signOut after a successful
// reset routes the user back to the auth screen.

import { useAuth } from '../context/AuthContext'
import { usePanicHardReset } from '../hooks/usePanicHardReset'

export function PanicHardResetProvider({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()

  usePanicHardReset({
    enabled: Boolean(user),
    onResult: ok => {
      if (ok) {
        void signOut()
      }
    },
  })

  return <>{children}</>
}
