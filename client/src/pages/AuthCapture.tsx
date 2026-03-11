import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase } from '../api';

const SOURCE_URLS: Record<string, string> = {
  carousell: 'https://www.carousell.com.my',
  vinted: 'https://www.vinted.com',
  mercari_jp: 'https://jp.mercari.com',
  kufar: 'https://www.kufar.by',
  rakuma: 'https://fril.jp'
};

const SOURCE_NAMES: Record<string, string> = {
  carousell: 'Carousell',
  vinted: 'Vinted',
  mercari_jp: 'Mercari Japan',
  kufar: 'Kufar',
  rakuma: 'Rakuma'
};

type AuthStatus = 'step1' | 'step2' | 'submitting' | 'done' | 'error';

function parseCookieInput(input: string): Record<string, string> {
  const cookieObject: Record<string, string> = {};

  for (const pair of input.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }

    cookieObject[key] = value;
  }

  return cookieObject;
}

export function AuthCapture() {
  const source = window.location.pathname.replace(/^\/auth\//, '').split('/')[0] ?? '';
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const marketUrl = SOURCE_URLS[source] ?? '';
  const sourceName = SOURCE_NAMES[source] ?? source;
  const [status, setStatus] = useState<AuthStatus>('step1');
  const [message, setMessage] = useState('');
  const [cookieInput, setCookieInput] = useState('');
  const apiBase = getApiBase();
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);

  const bookmarkletCode = useMemo(() => {
    const emptyMessage = `No cookies found on this page. Open ${sourceName}, make sure you are logged in, then try again.`;
    const successMessage = 'Cookies copied to clipboard. Return to Archive Finder and paste them into the form.';
    return `javascript:(()=>{const cookies=document.cookie;const fallback=()=>{const field=document.createElement('textarea');field.value=cookies;document.body.appendChild(field);field.select();document.execCommand('copy');document.body.removeChild(field);alert(${JSON.stringify(successMessage)});};if(!cookies){alert(${JSON.stringify(emptyMessage)});return;}if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(cookies).then(()=>alert(${JSON.stringify(successMessage)})).catch(fallback);}else{fallback();}})()`;
  }, [sourceName]);

  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarkletCode);
  }, [bookmarkletCode, status]);

  async function handleSubmit(): Promise<void> {
    const cookies = parseCookieInput(cookieInput);
    if (!token || Object.keys(cookies).length === 0) {
      setStatus('error');
      setMessage('Paste the marketplace cookies before submitting.');
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch(`${apiBase}/api/sessions/${source}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          cookies,
          userAgent: navigator.userAgent
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to connect account.' })) as { error?: string };
        throw new Error(payload.error ?? 'Failed to connect account.');
      }

      setStatus('done');
      setMessage(`${sourceName} account connected successfully.`);
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'SESSION_CAPTURED', source }, window.location.origin);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to connect account.');
    }
  }

  if (!source || !marketUrl) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Unknown Source</h1>
          <p className="auth-desc">This auth tab does not match a supported marketplace. You can close it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">AF</div>
        <h1 className="auth-title">Connect {sourceName}</h1>

        {status === 'step1' ? (
          <>
            <p className="auth-desc">
              Make sure you are logged in to <strong>{sourceName}</strong> in this browser, then continue to the cookie copy step.
            </p>
            <button
              type="button"
              className="auth-btn auth-btn--primary"
              onClick={() => {
                window.open(marketUrl, '_blank', 'noopener,noreferrer');
                setStatus('step2');
              }}
            >
              Open {sourceName} ↗
            </button>
            <button type="button" className="auth-btn auth-btn--ghost" onClick={() => setStatus('step2')}>
              Already logged in
            </button>
          </>
        ) : null}

        {status === 'step2' ? (
          <>
            <p className="auth-desc">
              Drag this bookmarklet to your bookmarks bar, open <a href={marketUrl} target="_blank" rel="noreferrer">{marketUrl}</a>,
              click the bookmarklet there, then paste the copied cookies below.
            </p>
            <a
              ref={bookmarkletRef}
              className="auth-bookmarklet"
              href="#"
              draggable
              onClick={(event) => {
                event.preventDefault();
                window.alert(`Drag this link to your bookmarks bar, then click it while viewing ${marketUrl}.`);
              }}
            >
              Copy Cookies Bookmarklet
            </a>
            <textarea
              className="auth-cookie-input"
              placeholder="Paste cookies here, for example: session=abc123; token=xyz456"
              value={cookieInput}
              onChange={(event) => setCookieInput(event.target.value)}
              rows={5}
            />
            <button
              type="button"
              className="auth-btn auth-btn--primary"
              onClick={() => void handleSubmit()}
              disabled={!cookieInput.trim()}
            >
              Connect Account
            </button>
            <button type="button" className="auth-btn auth-btn--ghost" onClick={() => setStatus('step1')}>
              Back
            </button>
          </>
        ) : null}

        {status === 'submitting' ? (
          <div className="auth-loading">
            <div className="auth-spinner" />
            <p className="auth-desc">Connecting your account...</p>
          </div>
        ) : null}

        {status === 'done' ? (
          <div className="auth-success">
            <div className="auth-checkmark">OK</div>
            <p>{message}</p>
            <p className="auth-hint">You can close this tab now.</p>
            <button type="button" className="auth-btn auth-btn--ghost" onClick={() => window.close()}>
              Close Tab
            </button>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="auth-error">
            <div className="auth-error-icon">ERR</div>
            <p className="auth-error-msg">{message}</p>
            <button type="button" className="auth-btn auth-btn--primary" onClick={() => setStatus('step1')}>
              Try Again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
