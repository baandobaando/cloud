import { PRIVACY_HTML, TERMS_HTML, legalArticle } from '../../shared/legal'

// The text lives in shared/legal.ts so the server can also send it as plain HTML (for crawlers and Google's review).
function LegalPage({ title, body }: { title: string; body: string }) {
  return <main className="page" dangerouslySetInnerHTML={{ __html: legalArticle(title, body) }} />
}

export function Privacy() {
  return <LegalPage title="Privacy Policy" body={PRIVACY_HTML} />
}

export function Terms() {
  return <LegalPage title="Terms of Service" body={TERMS_HTML} />
}
