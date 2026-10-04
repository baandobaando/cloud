import { useState, type FormEvent } from 'react'
import type { Profile } from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'
import Logo from '../components/Logo'

const MAX_PROFILES = 5

export default function ProfileGate() {
  const { me, selectProfile, refreshMe } = useSession()
  const toast = useToast()
  const dialog = useDialog()
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const profiles = me?.profiles ?? []

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await api.post<Profile>('/profiles', { name: name.trim() })
      await refreshMe()
      setName('')
      setAdding(false)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const rename = async (p: Profile) => {
    const next = await dialog.prompt({ title: 'Rename profile', defaultValue: p.name, confirmLabel: 'Save' })
    if (!next || next === p.name) return
    try {
      await api.patch(`/profiles/${p.id}`, { name: next })
      await refreshMe()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const remove = async (p: Profile) => {
    const ok = await dialog.confirm({
      title: `Delete ${p.name}?`,
      message: 'This profile’s list and watch history will be deleted.',
      confirmLabel: 'Delete profile',
      danger: true,
    })
    if (!ok) return
    try {
      await api.del(`/profiles/${p.id}`)
      await refreshMe()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="gate">
      <Logo size="big" />
      <h1>{managing ? 'Manage profiles' : "Who's watching?"}</h1>
      <div className="gate__profiles">
        {profiles.map((p) => (
          <div key={p.id} className="gate__item">
            <button className="gate__profile" onClick={() => (managing ? rename(p) : selectProfile(p.id))}>
              <span className="gate__avatar" style={{ background: p.color }}>
                {managing ? '✎' : p.name[0]}
              </span>
              {p.name}
            </button>
            {managing && profiles.length > 1 && (
              <button className="btn btn--link small" onClick={() => remove(p)}>
                Delete
              </button>
            )}
          </div>
        ))}
        {profiles.length < MAX_PROFILES && (
          <button className="gate__profile" onClick={() => setAdding(true)}>
            <span className="gate__avatar gate__avatar--add">+</span>
            Add Profile
          </button>
        )}
      </div>
      {adding && (
        <form className="gate__form" onSubmit={add}>
          <input autoFocus placeholder="Name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn--primary" type="submit">
            Save
          </button>
          <button className="btn btn--secondary" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      <button className="btn btn--glass" onClick={() => setManaging((m) => !m)}>
        {managing ? 'Done' : 'Manage profiles'}
      </button>
    </div>
  )
}
