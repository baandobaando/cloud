/**
 * Privacy policy, terms and a short site summary as plain HTML, so the server can put them in the page it
 * sends (search engines and Google's consent-screen review don't run JavaScript) and the app can show the same text.
 */

export const CONTACT_EMAIL = 'bingetubee@gmail.com'
export const LEGAL_UPDATED = 'October 4, 2026'

const contact = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`

export const PRIVACY_HTML = `
<p>This Privacy Policy explains how BingeTube (“BingeTube”, “we”, “us”), the short-drama streaming service at
<a href="https://binge.tube">binge.tube</a>, collects, uses, shares and protects information about you, and the choices you have.
If you have questions, contact us at ${contact}.</p>

<h2>1. Information we collect</h2>
<ul>
  <li><strong>Account information.</strong> When you create an account we collect your email address, the name you give us and a
  password, which we store only as a secure one-way hash.</li>
  <li><strong>Information from Google or Apple sign-in.</strong> If you choose “Continue with Google” or “Continue with Apple”, we receive
  your name, email address, whether that email is verified, and a unique account identifier from that provider. See section 3 for details
  about Google user data.</li>
  <li><strong>Viewing activity.</strong> The series and episodes you watch, your playback position, your profiles and your My List.</li>
  <li><strong>Payment information.</strong> Memberships are paid in cryptocurrency through third-party processors (NOWPayments or BTCPay
  Server). We record the order, amount, pass length, coin and payment status. We do not receive card numbers, bank details or wallet
  private keys.</li>
  <li><strong>Technical information.</strong> Essential cookies that keep you signed in, and server logs such as IP address, browser type
  and request times, used for security and troubleshooting.</li>
</ul>

<h2>2. How we use information</h2>
<ul>
  <li>To create, secure and maintain your account and sign you in.</li>
  <li>To stream episodes, remember where you stopped and show your My List.</li>
  <li>To process payments, unlock episodes for members and show your membership status.</li>
  <li>To understand in aggregate which series are watched, so we can improve the catalog and the service.</li>
  <li>To prevent fraud and abuse and to keep the service secure.</li>
  <li>To respond to you when you contact us, and to send important service messages (for example about your account).</li>
</ul>
<p>We do not sell your personal information, and we do not use it for third-party advertising or to build advertising profiles.</p>

<h2>3. Google user data</h2>
<p>If you sign in with Google, BingeTube requests only the basic scopes <code>openid</code>, <code>email</code> and <code>profile</code>.
From your Google Account we access only your <strong>name</strong>, <strong>email address</strong>, <strong>email verification status</strong>,
<strong>profile picture URL</strong> and your <strong>Google account identifier</strong>. We do not access your Gmail, contacts, Drive,
calendar or any other Google data.</p>
<ul>
  <li><strong>How we use it:</strong> only to create your BingeTube account, sign you in, and show your name in the app. Your Google email is
  used as your account email.</li>
  <li><strong>How we store it:</strong> in our account database on our hosting provider, protected by HTTPS in transit and access controls.</li>
  <li><strong>Sharing:</strong> we do not sell, rent or share Google user data with third parties, and we do not use it for advertising.
  It is not transferred to anyone except as necessary to operate the service (our hosting provider) or where required by law.</li>
  <li><strong>Limited Use:</strong> BingeTube’s use and transfer of information received from Google APIs adheres to the
  <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the
  Limited Use requirements.</li>
  <li><strong>Retention and deletion:</strong> we keep this data while your account exists. You can ask us to delete your account and
  associated Google data at any time by emailing ${contact}; we delete it within 30 days. You can also remove BingeTube’s access at any time
  from your Google Account at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</li>
</ul>

<h2>4. How we share information</h2>
<ul>
  <li><strong>Service providers</strong> that operate parts of BingeTube on our behalf and only for that purpose: hosting (Render), video
  storage and delivery (Bunny.net), payment processing (NOWPayments, BTCPay Server) and sign-in (Google, Apple).</li>
  <li><strong>Legal reasons:</strong> if required by law, or to protect the rights, property or safety of BingeTube, our users or others.</li>
  <li><strong>Business transfers:</strong> if BingeTube is involved in a merger or sale, information may transfer as part of that
  transaction, subject to this policy.</li>
</ul>

<h2>5. Cookies</h2>
<p>We use only essential cookies: one that keeps you signed in, and a short-lived one used during Google or Apple sign-in to protect
against forged requests. We do not use advertising or cross-site tracking cookies.</p>

<h2>6. Data retention</h2>
<p>We keep account and viewing data for as long as your account is open. When you delete your account we delete or anonymise your
personal information within 30 days, except payment records we must keep for accounting or legal purposes. Server logs are kept for a
limited period.</p>

<h2>7. Your rights and choices</h2>
<p>You can update your name and password in your account settings. You can ask us to access, correct, export or delete your personal
information by emailing ${contact}. Depending on where you live (for example the EU, UK or California) you may have additional rights
under laws such as the GDPR or CCPA, including the right to object to or restrict certain processing and to complain to a data
protection authority.</p>

<h2>8. Security</h2>
<p>We protect your information with HTTPS encryption, hashed passwords, signed and expiring video links, and limited access to our
systems. No method of transmission or storage is completely secure, but we work hard to protect your data.</p>

<h2>9. Children</h2>
<p>BingeTube is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a
child has given us personal information, contact us and we will delete it.</p>

<h2>10. International transfers</h2>
<p>Our providers may process information in countries other than yours. Where required, we rely on appropriate safeguards for these
transfers.</p>

<h2>11. Changes to this policy</h2>
<p>We may update this policy from time to time. We will change the “last updated” date above and, for significant changes, notify you
on the site or by email.</p>

<h2>12. Contact</h2>
<p>BingeTube — ${contact} — <a href="https://binge.tube">https://binge.tube</a></p>
`

export const TERMS_HTML = `
<p>These Terms of Service govern your use of BingeTube at <a href="https://binge.tube">binge.tube</a>. By creating an account or
watching on BingeTube you agree to them. If you do not agree, please do not use the service.</p>

<h2>1. Your account</h2>
<ul>
  <li>You must be at least 13 years old, and old enough to view the ratings of the series you choose.</li>
  <li>Keep your sign-in details safe. You are responsible for activity on your account.</li>
  <li>Give accurate information and keep your email address up to date.</li>
</ul>

<h2>2. Membership and payments</h2>
<ul>
  <li>Some episodes are free. A membership pass unlocks every episode of every series for the length you buy (1, 3 or 12 months), at the
  prices shown on the <a href="/plans">Plans</a> page.</li>
  <li>Passes are prepaid and do not renew automatically. Buying another pass adds time to your current one.</li>
  <li>Payments are made in cryptocurrency through third-party processors, whose terms also apply. Blockchain network fees are not set by
  us.</li>
  <li>Because access starts immediately, payments are generally non-refundable. If something went wrong with a payment or your access,
  contact us and we will look into it.</li>
  <li>We may change prices for future purchases; passes you have already bought are not affected.</li>
</ul>

<h2>3. Acceptable use</h2>
<p>BingeTube is for personal, non-commercial viewing. You agree not to:</p>
<ul>
  <li>download, record, copy, re-upload or redistribute any content;</li>
  <li>share your account or sell access to it;</li>
  <li>get around the paywall, video protection or other security measures;</li>
  <li>use bots or scrapers, or interfere with the service.</li>
</ul>
<p>We may suspend or close accounts that break these rules.</p>

<h2>4. Content</h2>
<p>The series on BingeTube are licensed to us or owned by their rights holders and are protected by copyright. The catalog may change as
licenses begin and end. If you believe something on BingeTube infringes your rights, email ${contact} with the details.</p>

<h2>5. Availability</h2>
<p>We work to keep BingeTube running smoothly, but the service is provided “as is” and may occasionally be interrupted for maintenance or
reasons beyond our control.</p>

<h2>6. Liability</h2>
<p>To the extent permitted by law, BingeTube is not liable for indirect or consequential losses, and our total liability to you is limited
to the amount you paid us in the 12 months before the claim.</p>

<h2>7. Ending your account</h2>
<p>You can stop using BingeTube at any time and ask us to delete your account. Unused pass time is not refunded.</p>

<h2>8. Privacy</h2>
<p>Our <a href="/privacy">Privacy Policy</a> explains how we handle your information.</p>

<h2>9. Changes</h2>
<p>We may update these terms. For significant changes we will tell you on the site or by email; continuing to use BingeTube means you
accept the updated terms.</p>

<h2>10. Contact</h2>
<p>${contact}</p>
`

/** What the homepage says before the app loads (and to crawlers): what BingeTube is, plus the legal links. */
export const HOME_SUMMARY_HTML = `
<h1>BingeTube</h1>
<p>BingeTube is a streaming service for short vertical drama series — billionaire romance, revenge, werewolf, mafia and more — in
one- to two-minute episodes. The first episodes of every series are free; a $9.99 monthly membership unlocks everything.</p>
<p><a href="/browse">Browse series</a> · <a href="/signup">Create an account</a> · <a href="/privacy">Privacy Policy</a> ·
<a href="/terms">Terms of Service</a></p>
`

/** Wraps a legal document the way the Privacy and Terms pages show it. */
export function legalArticle(title: string, body: string): string {
  return `<article class="container legal"><header class="legal__head"><span class="eyebrow">Legal</span><h1>${title}</h1>
<p class="muted small">Last updated ${LEGAL_UPDATED}</p></header>${body}</article>`
}
