import { useDialog } from '../components/Dialog'
import { DEMO_ADMIN, resetDemo } from './mockApi'

export function DemoAdminHint({ onUse }: { onUse: (email: string, password: string) => void }) {
  return (
    <div className="demo-note">
      <strong>Demo admin account</strong>
      <span>
        {DEMO_ADMIN.email} / {DEMO_ADMIN.password}
      </span>
      <button type="button" className="btn btn--grey btn--small" onClick={() => onUse(DEMO_ADMIN.email, DEMO_ADMIN.password)}>
        Fill in admin login
      </button>
    </div>
  )
}

export function ResetDemoButton() {
  const dialog = useDialog()
  return (
    <button
      className="btn btn--link"
      onClick={async () => {
        const ok = await dialog.confirm({
          title: 'Reset the demo?',
          message: 'Accounts, purchases and edits made in this browser are cleared and the starter catalog comes back.',
          confirmLabel: 'Reset demo',
          danger: true,
        })
        if (!ok) return
        resetDemo()
        window.location.hash = '#/'
        window.location.reload()
      }}
    >
      Reset demo data
    </button>
  )
}
