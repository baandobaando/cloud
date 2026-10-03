import { useState } from 'react'
import { useAppState } from '../state/AppState'

export default function ProfileGate() {
  const { profiles, selectProfile, addProfile } = useAppState()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addProfile(trimmed)
    setName('')
    setAdding(false)
  }

  return (
    <div className="gate">
      <div className="logo logo--big">REELFLIX</div>
      <h1>Who's watching?</h1>
      <div className="gate__profiles">
        {profiles.map((p) => (
          <button key={p.id} className="gate__profile" onClick={() => selectProfile(p.id)}>
            <span className="gate__avatar" style={{ background: p.color }}>
              {p.name[0]}
            </span>
            {p.name}
          </button>
        ))}
        {profiles.length < 5 && (
          <button className="gate__profile" onClick={() => setAdding(true)}>
            <span className="gate__avatar gate__avatar--add">+</span>
            Add Profile
          </button>
        )}
      </div>
      {adding && (
        <form className="gate__form" onSubmit={submit}>
          <input autoFocus placeholder="Name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn--white" type="submit">
            Save
          </button>
          <button className="btn btn--grey" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
