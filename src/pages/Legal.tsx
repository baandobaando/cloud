import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const CONTACT = 'bingetubee@gmail.com'
const UPDATED = 'October 4, 2026'

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page">
      <article className="container legal">
        <header className="legal__head">
          <span className="eyebrow">Legal</span>
          <h1>{title}</h1>
          <p className="muted small">Last updated {UPDATED}</p>
        </header>
        {children}
        <p className="legal__contact muted">
          Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </article>
    </main>
  )
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what BingeTube (“we”, “us”) collects when you use binge.tube, why, and the choices you have. We keep it to
        what we need to run the service.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, name and a securely hashed password. If you sign in with Google or Apple, we
          receive your name, email address and an account identifier from them. We never see your Google or Apple password.
        </li>
        <li>
          <strong>Viewing activity:</strong> the series and episodes you watch, where you stopped, and your My List, so you can resume and so
          we can see which shows are popular.
        </li>
        <li>
          <strong>Payments:</strong> memberships are paid in cryptocurrency through our payment processors (NOWPayments or BTCPay Server). We
          store the order, amount, coin and status. We do not receive or store card numbers or wallet private keys.
        </li>
        <li>
          <strong>Technical data:</strong> a sign-in cookie that keeps you logged in, and basic server logs (such as IP address and browser
          type) used for security and to fix problems.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To create and secure your account and keep you signed in.</li>
        <li>To stream episodes, remember your progress and unlock episodes for members.</li>
        <li>To process payments and show you your membership status.</li>
        <li>To understand, in aggregate, what people watch so we can improve the catalog.</li>
        <li>To answer you when you contact us.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for third-party advertising.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li>
          <strong>Service providers</strong> that run parts of BingeTube for us: hosting (Render), video delivery (Bunny.net), payment
          processing (NOWPayments, BTCPay Server) and sign-in (Google, Apple). They only get what they need to do that job.
        </li>
        <li>
          <strong>When required by law</strong>, or to protect the rights and safety of our users and the service.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use a small number of essential cookies: one to keep you signed in and a short-lived one during Google or Apple sign-in. We do not
        use advertising or tracking cookies.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account data while your account is open. Payment records may be kept longer where needed for accounting or legal reasons.
        Server logs are kept for a limited time.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can update your profile and password in your account settings. You can ask us for a copy of your data, to correct it, or to delete
        your account by emailing us. Depending on where you live, you may have additional rights under local law, such as the GDPR or CCPA.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, connections use HTTPS, and video links are signed and expire. No system is perfectly secure, but we work to
        protect your information.
      </p>

      <h2>Children</h2>
      <p>BingeTube is not intended for children under 13, and some series are rated for older viewers. We do not knowingly collect data from children under 13.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above, and for significant changes we will let you know on the site or by email.</p>
    </LegalPage>
  )
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of BingeTube at binge.tube. By creating an account or watching on BingeTube you agree to them. If you do
        not agree, please do not use the service.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 years old, and old enough to view the ratings of the series you choose.</li>
        <li>Keep your sign-in details safe. You are responsible for activity on your account.</li>
        <li>Give accurate information and keep your email address up to date.</li>
      </ul>

      <h2>Membership and payments</h2>
      <ul>
        <li>
          Some episodes are free. Membership unlocks every episode of every series for the length of the pass you buy (for example 1, 3 or 12
          months), priced as shown on the <Link to="/plans">Plans</Link> page.
        </li>
        <li>Passes are prepaid and do not renew automatically. Buying another pass adds time to your current one.</li>
        <li>Payments are made in cryptocurrency through third-party processors, whose own terms also apply. Network fees are set by the blockchain, not by us.</li>
        <li>
          Because access starts immediately, payments are generally non-refundable. If something went wrong with a payment or your access,
          contact us and we will look into it.
        </li>
        <li>We may change prices for future purchases; a pass you have already bought is not affected.</li>
      </ul>

      <h2>Using BingeTube</h2>
      <p>BingeTube is for your personal, non-commercial viewing. You agree not to:</p>
      <ul>
        <li>download, record, copy, re-upload or redistribute any content;</li>
        <li>share your account or sell access to it;</li>
        <li>get around the paywall, video protection or other security measures;</li>
        <li>use bots or scrapers, or interfere with the service.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>Content</h2>
      <p>
        The series on BingeTube are licensed to us or owned by their respective rights holders and are protected by copyright. The catalog may
        change over time as licenses begin and end. If you believe something on BingeTube infringes your rights, email us with the details.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep BingeTube running smoothly, but the service is provided “as is” and may occasionally be interrupted for maintenance or
        reasons beyond our control.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, BingeTube is not liable for indirect or consequential losses, and our total liability to you is limited
        to the amount you paid us in the 12 months before the claim.
      </p>

      <h2>Ending your account</h2>
      <p>You can stop using BingeTube at any time and ask us to delete your account. Unused pass time is not refunded.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If we make significant changes we will tell you on the site or by email; continuing to use BingeTube means you accept the updated terms.</p>
    </LegalPage>
  )
}
